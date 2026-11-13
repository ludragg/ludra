import { create, fromBinary, toBinary, type MessageInitShape } from "@bufbuild/protobuf";
import { ClientFrameSchema, type CodePurpose } from "@/protocol/ludra/v1/client_pb";
import type { Conversation, Message, Presence, User } from "@/protocol/ludra/v1/models_pb";
import { ErrorCode, ServerFrameSchema, type ServerFrame } from "@/protocol/ludra/v1/server_pb";

type Request = MessageInitShape<typeof ClientFrameSchema>["payload"];
type Reply = ServerFrame["payload"];
type Replies = { [R in Reply as R extends { case: infer K extends string } ? K : never]: R["value"] };
type ReplyCase = Exclude<keyof Replies, "error">;
type Settle = (reply: Reply | null) => void;

export type Account = {
  user: User;
  token: string;
};

export type SignIn = { account: Account } | { pendingEmail: string };

export class ServerError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class Client {
  onMessage: (message: Message) => void = () => {};
  onPresence: (userId: string, presence: Presence) => void = () => {};
  onClose: () => void = () => {};

  #socket: WebSocket;
  #nextId = 1;
  #pending = new Map<number, Settle>();

  static connect(url: string): Promise<Client> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      socket.onopen = () => resolve(new Client(socket));
      socket.onerror = () => reject(new Error("Não foi possível conectar ao servidor."));
    });
  }

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.onerror = null;
    socket.onmessage = (event) => this.#receive(event.data);
    socket.onclose = () => {
      this.#pending.forEach((settle) => settle(null));
      this.#pending.clear();
      this.onClose();
    };
  }

  register(email: string, username: string, password: string): Promise<SignIn> {
    return this.#signIn({ case: "register", value: { email, username, password } });
  }

  login(login: string, password: string): Promise<SignIn> {
    return this.#signIn({ case: "login", value: { login, password } });
  }

  verifyEmail(email: string, code: string): Promise<SignIn> {
    return this.#signIn({ case: "verifyEmail", value: { email, code } });
  }

  resetPassword(email: string, code: string, password: string): Promise<SignIn> {
    return this.#signIn({ case: "resetPassword", value: { email, code, password } });
  }

  resume(token: string): Promise<SignIn> {
    return this.#signIn({ case: "resume", value: { token } });
  }

  async sendCode(email: string, purpose: CodePurpose) {
    await this.#request({ case: "sendCode", value: { email, purpose } }, "codeSent");
  }

  async logout() {
    await this.#request({ case: "logout", value: {} }, "loggedOut");
  }

  async listConversations(): Promise<Conversation[]> {
    const { conversations } = await this.#request({ case: "listConversations", value: {} }, "conversationList");
    return conversations;
  }

  async openConversation(username: string): Promise<Conversation> {
    const { conversation } = await this.#request(
      { case: "openConversation", value: { username } },
      "conversationOpened",
    );
    return conversation!;
  }

  loadMessages(conversationId: string, beforeId = "") {
    return this.#request({ case: "loadMessages", value: { conversationId, beforeId } }, "messageHistory");
  }

  async sendMessage(conversationId: string, content: string): Promise<Message> {
    const { message } = await this.#request(
      { case: "sendMessage", value: { conversationId, content } },
      "messageCreated",
    );
    return message!;
  }

  close() {
    this.onClose = () => {};
    this.#socket.close();
  }

  async #signIn(payload: Request): Promise<SignIn> {
    const reply = await this.#send(payload);

    switch (reply.case) {
      case "loggedIn":
        return { account: { user: reply.value.user!, token: reply.value.token } };
      case "verificationRequired":
        return { pendingEmail: reply.value.email };
      default:
        throw new Error("Resposta inesperada do servidor.");
    }
  }

  async #request<C extends ReplyCase>(payload: Request, expected: C): Promise<Replies[C]> {
    const reply = await this.#send(payload);
    if (reply.case !== expected) {
      throw new Error("Resposta inesperada do servidor.");
    }
    return reply.value as Replies[C];
  }

  #send(payload: Request): Promise<Reply> {
    const requestId = this.#nextId++;

    return new Promise((resolve, reject) => {
      this.#pending.set(requestId, (reply) => {
        if (!reply) {
          reject(new Error("Conexão com o servidor perdida."));
        } else if (reply.case === "error") {
          reject(new ServerError(reply.value.code, reply.value.message));
        } else {
          resolve(reply);
        }
      });

      this.#socket.send(toBinary(ClientFrameSchema, create(ClientFrameSchema, { requestId, payload })));
    });
  }

  #receive(data: ArrayBuffer) {
    const frame = fromBinary(ServerFrameSchema, new Uint8Array(data));

    if (frame.requestId === 0) {
      this.#event(frame.payload);
      return;
    }

    this.#pending.get(frame.requestId)?.(frame.payload);
    this.#pending.delete(frame.requestId);
  }

  #event(payload: Reply) {
    switch (payload.case) {
      case "messageCreated":
        if (payload.value.message) {
          this.onMessage(payload.value.message);
        }
        break;
      case "presenceChanged":
        this.onPresence(payload.value.userId, payload.value.presence);
        break;
    }
  }
}
