import { create, fromBinary, toBinary, type MessageInitShape } from "@bufbuild/protobuf";
import { timestampMs } from "@bufbuild/protobuf/wkt";
import { splitKey } from "@/helpers/files";
import { t } from "@/i18n";
import { ClientFrameSchema, type CodePurpose } from "@/protocol/ludra/v1/client_pb";
import {
  FileSignalKind,
  type Call,
  type CallSignal,
  type Conversation,
  type FileSignal,
  type Friend,
  type GroupCall,
  type Message,
  type Presence,
  type SignalKind,
  type User,
} from "@/protocol/ludra/v1/models_pb";
import {
  ErrorCode,
  ServerFrameSchema,
  type CallEndReason,
  type GroupCallJoined,
  type ServerFrame,
} from "@/protocol/ludra/v1/server_pb";

type Request = MessageInitShape<typeof ClientFrameSchema>["payload"];
type Reply = ServerFrame["payload"];
type Replies = { [R in Reply as R extends { case: infer K extends string } ? K : never]: R["value"] };
type ReplyCase = Exclude<keyof Replies, "error">;
type Settle = (reply: Reply | null) => void;

const pingEvery = 10_000;
const pingTimeout = 20_000;

export type Account = {
  user: User;
  token: string;
  email: string;
  twoFactor: boolean;
  renamedAt: number | null;
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
  onMessageUpdated: (message: Message) => void = () => {};
  onMessageDeleted: (conversationId: string, messageId: string, last: Message | undefined) => void = () => {};
  onPresence: (userId: string, presence: Presence) => void = () => {};
  onFriend: (friend: Friend) => void = () => {};
  onFriendRemoved: (userId: string) => void = () => {};
  onUserUpdated: (user: User) => void = () => {};
  onTwoFactorChanged: (enabled: boolean) => void = () => {};
  onCallIncoming: (call: Call) => void = (call) => (this.waitingCall = call);
  waitingCall: Call | null = null;
  onCallAccepted: (callId: string, direct: boolean) => void = () => {};
  onCallEnded: (callId: string, reason: CallEndReason) => void = () => {};
  onCallSignal: (signal: CallSignal) => void = () => {};
  onFileSignal: (signal: FileSignal) => void = () => {};
  onConversationUpdated: (conversation: Conversation) => void = () => {};
  onBlocked: (users: User[]) => void = () => {};
  onConversationRemoved: (conversationId: string) => void = () => {};
  onGroupCallUpdated: (conversationId: string, call: GroupCall | undefined) => void = () => {};
  onGroupCallRinging: (conversationId: string, starter: User) => void = () => {};
  onUpdateAvailable: (version: string) => void = () => {};
  onStreamPreview: (conversationId: string, userId: string, image: string) => void = () => {};
  onClose: () => void = () => {};

  #socket: WebSocket;
  #nextId = 1;
  #pending = new Map<number, Settle>();
  #heartbeat: number;

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
    socket.onclose = () => this.#closed();
    this.#heartbeat = window.setInterval(() => this.#ping(), pingEvery);
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

  async sendMessage(conversationId: string, content: string, replyToId = ""): Promise<Message> {
    const { message } = await this.#request(
      { case: "sendMessage", value: { conversationId, content, replyToId } },
      "messageCreated",
    );
    return message!;
  }

  async editMessage(messageId: string, content: string): Promise<Message> {
    const { message } = await this.#request({ case: "editMessage", value: { messageId, content } }, "messageUpdated");
    return message!;
  }

  getImage(id: string, offset: number) {
    return this.#request({ case: "getImage", value: { id, offset } }, "imageData");
  }

  async sendDirectFiles(
    conversationId: string,
    files: { name: string; size: number; mime: string; censored: boolean }[],
    content = "",
    replyToId = "",
  ): Promise<Message> {
    const [first, ...extra] = files;
    const { message } = await this.#request(
      {
        case: "sendDirectFile",
        value: {
          conversationId,
          name: first.name,
          size: BigInt(first.size),
          mime: first.mime,
          censored: first.censored,
          extra: extra.map((file) => ({ ...file, size: BigInt(file.size) })),
          content,
          replyToId,
        },
      },
      "messageCreated",
    );
    return message!;
  }

  requestFile(key: string, transferId: string, direct: boolean, offset = 0, length = 0) {
    const { messageId, index } = splitKey(key);
    return this.#request(
      {
        case: "fileSignal",
        value: {
          messageId,
          fileIndex: index,
          transferId,
          direct,
          offset: BigInt(offset),
          length: BigInt(length),
          kind: FileSignalKind.REQUEST,
        },
      },
      "fileTransfer",
    );
  }

  async fileSignal(
    key: string,
    transferId: string,
    peerId: string,
    kind: FileSignalKind,
    payload = "",
    ranged = false,
  ) {
    const { messageId } = splitKey(key);
    await this.#request({ case: "fileSignal", value: { messageId, transferId, peerId, kind, payload, ranged } }, "ack");
  }

  searchGifs(query: string, pos: string, locale: string) {
    return this.#request({ case: "searchGifs", value: { query, pos, locale } }, "gifResults");
  }

  gifPreview(id: string) {
    return this.#request({ case: "getGifPreview", value: { id } }, "imageData");
  }

  async sendGif(conversationId: string, id: string, replyToId = ""): Promise<Message> {
    const { message } = await this.#request(
      { case: "sendGif", value: { conversationId, id, replyToId } },
      "messageCreated",
    );
    return message!;
  }

  async removePreview(messageId: string): Promise<Message> {
    const { message } = await this.#request({ case: "removePreview", value: { messageId } }, "messageUpdated");
    return message!;
  }

  deleteMessage(messageId: string) {
    return this.#request({ case: "deleteMessage", value: { messageId } }, "messageDeleted");
  }

  async setUsername(username: string): Promise<User> {
    const { user } = await this.#request({ case: "setUsername", value: { username } }, "userUpdated");
    return user!;
  }

  async listFriends(): Promise<Friend[]> {
    const { friends } = await this.#request({ case: "listFriends", value: {} }, "friendList");
    return friends;
  }

  async listBlocked(): Promise<User[]> {
    const { users } = await this.#request({ case: "listBlocked", value: {} }, "blockedList");
    return users;
  }

  async blockUser(userId: string): Promise<User[]> {
    const { users } = await this.#request({ case: "blockUser", value: { userId } }, "blockedList");
    return users;
  }

  async unblockUser(userId: string): Promise<User[]> {
    const { users } = await this.#request({ case: "unblockUser", value: { userId } }, "blockedList");
    return users;
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

  async setIdentityKey(key: string) {
    await this.#request({ case: "setIdentityKey", value: { key } }, "ack");
  }

  async listIdentityKeys(userIds: string[]): Promise<Record<string, string>> {
    const { keys } = await this.#request({ case: "listIdentityKeys", value: { userIds } }, "identityKeys");
    return keys;
  }

  async setAvatar(image: Uint8Array): Promise<User> {
    const { user } = await this.#request({ case: "setAvatar", value: { image } }, "userUpdated");
    return user!;
  }

  async removeAvatar(): Promise<User> {
    const { user } = await this.#request({ case: "removeAvatar", value: {} }, "userUpdated");
    return user!;
  }

  async startCall(userId: string, direct: boolean): Promise<Call> {
    const { call } = await this.#request({ case: "startCall", value: { userId, direct } }, "callStarted");
    return call!;
  }

  async answerCall(callId: string, direct: boolean) {
    await this.#request({ case: "answerCall", value: { callId, direct } }, "callAccepted");
  }

  async endCall(callId: string) {
    await this.#request({ case: "endCall", value: { callId } }, "callEnded");
  }

  async sendSignal(callId: string, kind: SignalKind, payload: string, peerId = "") {
    await this.#request({ case: "callSignal", value: { callId, kind, payload, peerId } }, "ack");
  }

  async createGroup(name: string, memberIds: string[]): Promise<Conversation> {
    const { conversation } = await this.#request(
      { case: "createGroup", value: { name, memberIds } },
      "conversationUpdated",
    );
    return conversation!;
  }

  async addGroupMembers(conversationId: string, userIds: string[]): Promise<Conversation> {
    const { conversation } = await this.#request(
      { case: "addGroupMembers", value: { conversationId, userIds } },
      "conversationUpdated",
    );
    return conversation!;
  }

  async removeGroupMember(conversationId: string, userId: string): Promise<Conversation> {
    const { conversation } = await this.#request(
      { case: "removeGroupMember", value: { conversationId, userId } },
      "conversationUpdated",
    );
    return conversation!;
  }

  async leaveGroup(conversationId: string) {
    await this.#request({ case: "leaveGroup", value: { conversationId } }, "conversationRemoved");
  }

  joinGroupCall(conversationId: string, direct: boolean): Promise<GroupCallJoined> {
    return this.#request({ case: "joinGroupCall", value: { conversationId, direct } }, "groupCallJoined");
  }

  async transferGroup(conversationId: string, userId: string): Promise<Conversation> {
    const { conversation } = await this.#request(
      { case: "transferGroup", value: { conversationId, userId } },
      "conversationUpdated",
    );
    return conversation!;
  }

  async renameGroup(conversationId: string, name: string): Promise<Conversation> {
    const { conversation } = await this.#request(
      { case: "renameGroup", value: { conversationId, name } },
      "conversationUpdated",
    );
    return conversation!;
  }

  async setGroupAvatar(conversationId: string, image: Uint8Array): Promise<Conversation> {
    const { conversation } = await this.#request(
      { case: "setGroupAvatar", value: { conversationId, image } },
      "conversationUpdated",
    );
    return conversation!;
  }

  async deleteGroup(conversationId: string) {
    await this.#request({ case: "deleteGroup", value: { conversationId } }, "conversationRemoved");
  }

  async declineGroupCall(conversationId: string) {
    await this.#request({ case: "declineGroupCall", value: { conversationId } }, "ack");
  }

  async leaveGroupCall(callId: string) {
    await this.#request({ case: "leaveGroupCall", value: { callId } }, "ack");
  }

  close() {
    this.onClose = () => {};
    this.#socket.close();
  }

  async #ping() {
    let timer = 0;
    const arm = () => {
      timer = window.setTimeout(() => (this.#socket.bufferedAmount > 0 ? arm() : this.#drop()), pingTimeout);
    };
    arm();
    await this.#send({ case: "ping", value: {} }).catch(() => undefined);
    window.clearTimeout(timer);
  }

  #drop() {
    this.#socket.onclose = null;
    this.#socket.onmessage = null;
    this.#socket.close();
    this.#closed();
  }

  #closed() {
    window.clearInterval(this.#heartbeat);
    this.#pending.forEach((settle) => settle(null));
    this.#pending.clear();
    this.onClose();
  }

  async #signIn(payload: Request): Promise<SignIn> {
    const reply = await this.#send(payload);

    switch (reply.case) {
      case "loggedIn": {
        const { user, token, email, twoFactor, usernameChangedAt } = reply.value;
        const renamedAt = usernameChangedAt ? timestampMs(usernameChangedAt) : null;
        return { account: { user: user!, token, email, twoFactor, renamedAt } };
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
      case "messageUpdated":
        if (payload.value.message) {
          this.onMessageUpdated(payload.value.message);
        }
        break;
      case "messageDeleted":
        this.onMessageDeleted(payload.value.conversationId, payload.value.messageId, payload.value.lastMessage);
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
      case "callIncoming":
        if (payload.value.call) {
          this.onCallIncoming(payload.value.call);
        }
        break;
      case "callAccepted":
        this.onCallAccepted(payload.value.callId, payload.value.direct);
        break;
      case "callEnded":
        this.onCallEnded(payload.value.callId, payload.value.reason);
        break;
      case "callSignal":
        this.onCallSignal(payload.value);
        break;
      case "fileSignal":
        this.onFileSignal(payload.value);
        break;
      case "conversationUpdated":
        if (payload.value.conversation) {
          this.onConversationUpdated(payload.value.conversation);
        }
        break;
      case "blockedList":
        this.onBlocked(payload.value.users);
        break;
      case "conversationRemoved":
        this.onConversationRemoved(payload.value.conversationId);
        break;
      case "groupCallUpdated":
        this.onGroupCallUpdated(payload.value.conversationId, payload.value.call);
        break;
      case "groupCallRinging":
        if (payload.value.starter) {
          this.onGroupCallRinging(payload.value.conversationId, payload.value.starter);
        }
        break;
      case "updateAvailable":
        this.onUpdateAvailable(payload.value.version);
        break;
      case "streamPreview":
        this.onStreamPreview(payload.value.conversationId, payload.value.userId, payload.value.image);
        break;
    }
  }
}
