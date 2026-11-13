import { create, fromBinary, toBinary, type MessageInitShape } from "@bufbuild/protobuf";
import { t } from "@/i18n";
import { ClientFrameSchema, type CodePurpose } from "@/protocol/ludra/v1/client_pb";
import type { Conversation, Friend, Message, Presence, User } from "@/protocol/ludra/v1/models_pb";
import { ErrorCode, ServerFrameSchema, type ServerFrame } from "@/protocol/ludra/v1/server_pb";

type Request = MessageInitShape<typeof ClientFrameSchema>["payload"];
type Reply = ServerFrame["payload"];
type Replies = { [R in Reply as R extends { case: infer K extends string } ? K : never]: R["value"] };
type ReplyCase = Exclude<keyof Replies, "error">;
type Settle = (reply: Reply | null) => void;

export type Account = {
  user: User;
  token: string;
  email: string;
  twoFactor: boolean;
};

export type SignIn = { account: Account } | { pendingEmail: string } | { twoFactorEmail: string };

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
  onFriend: (friend: Friend) => void = () => {};
  onFriendRemoved: (userId: string) => void = () => {};
  onUserUpdated: (user: User) => void = () => {};
  onTwoFactorChanged: (enabled: boolean) => void = () => {};
  onClose: () => void = () => {};

  #socket: WebSocket;
  #nextId = 1;
  #pending = new Map<number, Settle>();

  static connect(url: string): Promise<Client> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      socket.onopen = () => resolve(new Client(socket));
      socket.onerror = () => reject(new Error(t("common.connectionFailed")));
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

  register(email: string, username: string, password: string, locale: string): Promise<SignIn> {
    return this.#signIn({ case: "register", value: { email, username, password, locale } });
  }

  login(login: string, password: string, locale: string): Promise<SignIn> {
    return this.#signIn({ case: "login", value: { login, password, locale } });
  }

  verifyEmail(email: string, code: string): Promise<SignIn> {
    return this.#signIn({ case: "verifyEmail", value: { email, code } });
  }

  verifyTwoFactor(code: string): Promise<SignIn> {
    return this.#signIn({ case: "verifyTwoFactor", value: { code } });
  }

  resetPassword(email: string, code: string, password: string): Promise<SignIn> {
    return this.#signIn({ case: "resetPassword", value: { email, code, password } });
  }

  resume(token: string): Promise<SignIn> {
    return this.#signIn({ case: "resume", value: { token } });
  }

  async sendCode(email: string, purpose: CodePurpose, locale: string) {
    await this.#request({ case: "sendCode", value: { email, purpose, locale } }, "codeSent");
  }

  async resendTwoFactor(locale: string) {
    await this.#request({ case: "resendTwoFactor", value: { locale } }, "codeSent");
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

  async listFriends(): Promise<Friend[]> {
    const { friends } = await this.#request({ case: "listFriends", value: {} }, "friendList");
    return friends;
  }

  async addFriend(username: string): Promise<Friend> {
    const { friend } = await this.#request({ case: "addFriend", value: { username } }, "friendUpdated");
    return friend!;
  }

  async acceptFriend(userId: string): Promise<Friend> {
    const { friend } = await this.#request({ case: "acceptFriend", value: { userId } }, "friendUpdated");
    return friend!;
  }

  async removeFriend(userId: string) {
    await this.#request({ case: "removeFriend", value: { userId } }, "friendRemoved");
  }

  async setPresence(presence: Presence) {
    await this.#request({ case: "setPresence", value: { presence } }, "presenceChanged");
  }

  async changePassword(currentPassword: string, newPassword: string) {
    await this.#request({ case: "changePassword", value: { currentPassword, newPassword } }, "passwordChanged");
  }

  async setTwoFactor(enabled: boolean, password: string) {
    await this.#request({ case: "setTwoFactor", value: { enabled, password } }, "twoFactorChanged");
  }

  async setAvatar(image: Uint8Array): Promise<User> {
    const { user } = await this.#request({ case: "setAvatar", value: { image } }, "userUpdated");
    return user!;
  }

  async removeAvatar(): Promise<User> {
    const { user } = await this.#request({ case: "removeAvatar", value: {} }, "userUpdated");
    return user!;
  }

  close() {
    this.onClose = () => {};
    this.#socket.close();
  }

  async #signIn(payload: Request): Promise<SignIn> {
    const reply = await this.#send(payload);

    switch (reply.case) {
      case "loggedIn": {
        const { user, token, email, twoFactor } = reply.value;
        return { account: { user: user!, token, email, twoFactor } };
      }
      case "verificationRequired":
        return { pendingEmail: reply.value.email };
      case "twoFactorRequired":
        return { twoFactorEmail: reply.value.email };
      default:
        throw new Error(t("common.unexpectedReply"));
    }
  }

  async #request<C extends ReplyCase>(payload: Request, expected: C): Promise<Replies[C]> {
    const reply = await this.#send(payload);
    if (reply.case !== expected) {
      throw new Error(t("common.unexpectedReply"));
    }
    return reply.value as Replies[C];
  }

  #send(payload: Request): Promise<Reply> {
    const requestId = this.#nextId++;

    return new Promise((resolve, reject) => {
      this.#pending.set(requestId, (reply) => {
        if (!reply) {
          reject(new Error(t("common.connectionLost")));
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
      case "friendUpdated":
        if (payload.value.friend) {
          this.onFriend(payload.value.friend);
        }
        break;
      case "friendRemoved":
        this.onFriendRemoved(payload.value.userId);
        break;
      case "userUpdated":
        if (payload.value.user) {
          this.onUserUpdated(payload.value.user);
        }
        break;
      case "twoFactorChanged":
        this.onTwoFactorChanged(payload.value.enabled);
        break;
    }
  }
}
