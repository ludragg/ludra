import { t } from "@/i18n";
import type { CodePurpose } from "@/protocol/ludra/v1/client_pb";
import {
  ConversationKind,
  FriendState,
  MessageKind,
  Presence,
  type Conversation,
  type Friend,
  type GroupCall,
  type Message,
  type User,
} from "@/protocol/ludra/v1/models_pb";
import { Client, ServerError, type Account, type SignIn } from "@/services/client";
import { isCall } from "@/helpers/call-summary";
import { maxUploadBytes, toAvatar } from "@/helpers/image";
import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
import { notify, playMessageSound, windowFocused } from "@/services/desktop";
import { serverUrl } from "@/services/server";
import { clearSessionToken, readSessionToken, saveSessionToken } from "@/services/session-token";
import { calls } from "@/stores/call.svelte";
import { focus } from "@/stores/focus";
import { groupCall } from "@/stores/group-call.svelte";
import { preferences } from "@/stores/preferences.svelte";
import { trust } from "@/stores/trust.svelte";
import { updates } from "@/stores/updates.svelte";

type Thread = {
  messages: Message[];
  hasMore: boolean;
  loading: boolean;
};

export type View = "friends" | "settings";

export type SidebarTab = "direct" | "group";

export type Next = { verify: string } | { twoFactor: string } | null;

const retryDelays = [1000, 2000, 4000, 8000, 15_000];
const maxAttempts = 12;

class ChatStore {
  user = $state<User | null>(null);
  email = $state("");
  twoFactor = $state(false);
  restoring = $state(true);
  reconnecting = $state(false);
  notice = $state("");
  view = $state<View>("friends");
  conversations = $state<Conversation[]>([]);
  friends = $state<Friend[]>([]);
  blocked = $state<User[]>([]);
  activeId = $state<string | null>(null);
  sidebarTab = $state<SidebarTab>("direct");
  names = $state<Record<string, string>>({});
  groupPhotoError = $state<{ conversationId: string; message: string } | null>(null);
  threads = $state<Record<string, Thread>>({});
  unread = $state<Record<string, number>>({});

  active = $derived(this.conversations.find((conversation) => conversation.id === this.activeId) ?? null);
  thread = $derived(this.activeId ? this.threads[this.activeId] : undefined);
  incoming = $derived(this.friends.filter(({ state }) => state === FriendState.INCOMING).length);
  directs = $derived(this.conversations.filter(({ kind }) => kind !== ConversationKind.GROUP));
  groups = $derived(this.conversations.filter(({ kind }) => kind === ConversationKind.GROUP));

  #client: Client | null = null;
  #challenge: Client | null = null;
  #photoTimer: number | undefined;

  constructor() {
    this.#restore();
  }

  register(email: string, username: string, password: string) {
    return this.#authenticate((client) => client.register(email, username, password, preferences.values.language));
  }

  login(login: string, password: string) {
    return this.#authenticate((client) => client.login(login, password, preferences.values.language));
  }

  verifyEmail(email: string, code: string) {
    return this.#authenticate((client) => client.verifyEmail(email, code));
  }

  resetPassword(email: string, code: string, password: string) {
    return this.#authenticate((client) => client.resetPassword(email, code, password));
  }

  async verifyTwoFactor(code: string) {
    const client = this.#challenge;
    if (!client) {
      throw new Error(t("common.connectionLost"));
    }
    await this.#authenticate((pending) => pending.verifyTwoFactor(code), client);
    this.#challenge = null;
  }

  async resendTwoFactor() {
    if (!this.#challenge) {
      throw new Error(t("common.connectionLost"));
    }
    await this.#challenge.resendTwoFactor(preferences.values.language);
  }

  cancelTwoFactor() {
    this.#challenge?.close();
    this.#challenge = null;
  }

  async sendCode(email: string, purpose: CodePurpose) {
    const client = await Client.connect(serverUrl);
    try {
      await client.sendCode(email, purpose, preferences.values.language);
    } finally {
      client.close();
    }
  }

  async logout() {
    const client = this.#client;
    clearSessionToken();
    this.#reset("");

    if (client) {
      await client.logout().catch(() => undefined);
      client.close();
    }
  }

  async #restore() {
    const token = readSessionToken();

    if (token) {
      try {
        await this.#authenticate((client) => client.resume(token));
      } catch (error) {
        if (error instanceof ServerError) {
          clearSessionToken();
        } else {
          this.notice = t("common.connectionFailed");
        }
      }
    }

    this.restoring = false;
  }

  async #authenticate(start: (client: Client) => Promise<SignIn>, existing?: Client): Promise<Next> {
    const client = existing ?? (await Client.connect(serverUrl));

    try {
      const result = await start(client);
      if ("pendingEmail" in result) {
        client.close();
        return { verify: result.pendingEmail };
      }
      if ("twoFactorEmail" in result) {
        this.#challenge?.close();
        this.#challenge = client;
        return { twoFactor: result.twoFactorEmail };
      }

      await this.#open(client, result.account);
      return null;
    } catch (error) {
      if (!existing) {
        client.close();
      }
      throw error;
    }
  }

  async #open(client: Client, account: Account) {
    const [conversations, friends, blocked] = await Promise.all([
      client.listConversations(),
      client.listFriends(),
      client.listBlocked(),
    ]);
    saveSessionToken(account.token);

    client.onMessage = (message) => this.#receive(message);
    client.onMessageUpdated = (message) => this.#update(message);
    client.onPresence = (userId, presence) => this.#presence(userId, presence);
    client.onFriend = (friend) => this.#friend(friend, true);
    client.onFriendRemoved = (userId) => this.#unfriend(userId);
    client.onUserUpdated = (user) => this.#userUpdated(user);
    client.onTwoFactorChanged = (enabled) => (this.twoFactor = enabled);
    client.onConversationUpdated = (conversation) => this.#upsert(conversation);
    client.onBlocked = (users) => (this.blocked = users);
    client.onConversationRemoved = (conversationId) => this.#removeConversation(conversationId);
    client.onGroupCallUpdated = (conversationId, call) => this.#groupCallUpdated(conversationId, call);
    client.onGroupCallRinging = (conversationId, starter) => {
      this.#remember(starter);
      if (!this.isBlocked(starter.id)) {
        groupCall.ring(conversationId, starter);
      }
    };
    client.onUpdateAvailable = () => updates.check();
    client.onClose = () => this.#reconnect();
    await trust.attach(client, account.user.id).catch(() => undefined);
    calls.attach(client);
    groupCall.attach(client);
    groupCall.friendly = (userId) => this.isFriend(userId);

    this.#client = client;
    this.user = account.user;
    focus.busy = account.user.presence === Presence.BUSY;
    this.email = account.email;
    this.twoFactor = account.twoFactor;
    this.names = {};
    this.#remember(account.user);
    for (const friend of friends) {
      this.#remember(friend.user);
    }
    for (const conversation of conversations) {
      this.#remember(conversation.peer);
      for (const member of conversation.members) {
        this.#remember(member);
      }
      if (conversation.lastMessage) {
        this.#rememberMessage(conversation.lastMessage);
      }
    }
    this.conversations = conversations;
    this.friends = friends;
    this.blocked = blocked;
    this.view = "friends";
    this.notice = "";
  }

  async #reconnect() {
    const token = readSessionToken();
    const activeId = this.activeId;
    const sidebarTab = this.sidebarTab;
    const voice = groupCall.snapshot();
    this.#reset(token ? "" : t("common.connectionLost"));
    if (!token) {
      return;
    }

    this.reconnecting = true;
    for (let attempt = 0; this.reconnecting; attempt++) {
      if (attempt === maxAttempts) {
        this.reconnecting = false;
        this.notice = t("common.connectionLost");
        return;
      }
      try {
        await this.#authenticate((client) => client.resume(token));
        break;
      } catch (error) {
        if (error instanceof ServerError && error.code === ErrorCode.UNAUTHENTICATED) {
          clearSessionToken();
          this.reconnecting = false;
          this.notice = t("common.connectionLost");
          return;
        }
        const delay = retryDelays[Math.min(attempt, retryDelays.length - 1)];
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
    }
    this.reconnecting = false;

    const user = this.user;
    if (!user) {
      return;
    }
    this.sidebarTab = sidebarTab;
    if (activeId && this.conversations.some(({ id }) => id === activeId)) {
      await this.select(activeId).catch(() => undefined);
    }
    if (voice && this.conversations.some(({ id, call }) => id === voice.conversationId && call)) {
      await groupCall.restore(voice, user.id);
    }
  }

  nameOf(userId: string): string {
    return this.names[userId] ?? "?";
  }

  presenceOf(userId: string): Presence | null {
    const friend = this.friends.find(({ user, state }) => user?.id === userId && state === FriendState.ACCEPTED);
    return friend?.user?.presence ?? null;
  }

  async createGroup(name: string, memberIds: string[]) {
    const conversation = await this.#client!.createGroup(name, memberIds);
    this.#upsert(conversation);
    this.sidebarTab = "group";
    await this.select(conversation.id);
  }

  async addGroupMembers(conversationId: string, userIds: string[]) {
    this.#upsert(await this.#client!.addGroupMembers(conversationId, userIds));
  }

  async removeGroupMember(conversationId: string, userId: string) {
    this.#upsert(await this.#client!.removeGroupMember(conversationId, userId));
  }

  async transferGroup(conversationId: string, userId: string) {
    this.#upsert(await this.#client!.transferGroup(conversationId, userId));
  }

  async setGroupPhoto(conversationId: string, file: File) {
    this.groupPhotoError = null;
    try {
      if (file.type !== "image/png") {
        throw new Error(t("settings.photoType"));
      }
      if (file.size > maxUploadBytes) {
        throw new Error(t("settings.photoSize"));
      }
      this.#upsert(await this.#client!.setGroupAvatar(conversationId, await toAvatar(file)));
    } catch (cause) {
      this.#groupPhotoFailed(conversationId, cause);
    }
  }

  async removeGroupPhoto(conversationId: string) {
    this.groupPhotoError = null;
    try {
      this.#upsert(await this.#client!.setGroupAvatar(conversationId, new Uint8Array()));
    } catch (cause) {
      this.#groupPhotoFailed(conversationId, cause);
    }
  }

  #groupPhotoFailed(conversationId: string, cause: unknown) {
    const message =
      cause instanceof ServerError
        ? cause.code === ErrorCode.TOO_MANY_REQUESTS
          ? t("common.tooManyRequests")
          : t("settings.photoFailed")
        : cause instanceof Error
          ? cause.message
          : t("settings.photoFailed");
    this.groupPhotoError = { conversationId, message };
    window.clearTimeout(this.#photoTimer);
    this.#photoTimer = window.setTimeout(() => (this.groupPhotoError = null), 4000);
  }

  async deleteGroup(conversationId: string) {
    await this.#client!.deleteGroup(conversationId);
    this.#removeConversation(conversationId);
  }

  async leaveGroup(conversationId: string) {
    await this.#client!.leaveGroup(conversationId);
    this.#removeConversation(conversationId);
  }

  showFriends() {
    this.activeId = null;
    this.view = "friends";
  }

  showSettings() {
    this.activeId = null;
    this.view = "settings";
  }

  isBlocked(userId: string) {
    return this.blocked.some(({ id }) => id === userId);
  }

  async block(userId: string) {
    this.blocked = await this.#client!.blockUser(userId);
    this.#unfriend(userId);
  }

  async unblock(userId: string) {
    this.blocked = await this.#client!.unblockUser(userId);
  }

  isFriend(userId: string) {
    return this.friends.some(({ user, state }) => user?.id === userId && state === FriendState.ACCEPTED);
  }

  async addFriend(username: string): Promise<Friend> {
    const friend = await this.#client!.addFriend(username);
    this.#friend(friend);
    return friend;
  }

  async acceptFriend(userId: string) {
    this.#friend(await this.#client!.acceptFriend(userId));
  }

  async removeFriend(userId: string) {
    await this.#client!.removeFriend(userId);
    this.#unfriend(userId);
  }

  async setPresence(presence: Presence) {
    await this.#client!.setPresence(presence);
    this.#presence(this.user!.id, presence);
  }

  async changePassword(currentPassword: string, newPassword: string) {
    await this.#client!.changePassword(currentPassword, newPassword);
  }

  async setTwoFactor(enabled: boolean, password = "") {
    await this.#client!.setTwoFactor(enabled, password);
    this.twoFactor = enabled;
  }

  async setAvatar(image: Uint8Array) {
    this.#userUpdated(await this.#client!.setAvatar(image));
  }

  async removeAvatar() {
    this.#userUpdated(await this.#client!.removeAvatar());
  }

  async select(conversationId: string) {
    this.activeId = conversationId;
    delete this.unread[conversationId];

    if (!this.threads[conversationId]) {
      await this.#load(conversationId);
    }
  }

  async start(username: string) {
    const conversation = await this.#client!.openConversation(username);

    if (!this.conversations.some(({ id }) => id === conversation.id)) {
      this.conversations.unshift(conversation);
    }
    await this.select(conversation.id);
  }

  async loadOlder() {
    const thread = this.thread;
    if (!this.activeId || !thread || !thread.hasMore || thread.loading) {
      return;
    }
    await this.#load(this.activeId, thread.messages[0]?.id);
  }

  async send(content: string) {
    const message = await this.#client!.sendMessage(this.activeId!, content);
    this.#receive(message);
  }

  async #load(conversationId: string, beforeId = "") {
    this.threads[conversationId] ??= { messages: [], hasMore: false, loading: false };
    const thread = this.threads[conversationId];
    thread.loading = true;

    try {
      const history = await this.#client!.loadMessages(conversationId, beforeId);
      thread.messages = merge(thread.messages, history.messages);
      thread.hasMore = history.hasMore;
    } finally {
      thread.loading = false;
    }
  }

  async #receive(message: Message) {
    this.#rememberMessage(message);
    const thread = this.threads[message.conversationId];
    if (thread) {
      thread.messages = merge(thread.messages, [message]);
    }

    const index = this.conversations.findIndex(({ id }) => id === message.conversationId);
    if (index === -1) {
      this.conversations = await this.#client!.listConversations();
    } else {
      const [conversation] = this.conversations.splice(index, 1);
      conversation.lastMessage = message;
      this.conversations.unshift(conversation);
    }

    if (message.senderId === this.user?.id) {
      return;
    }

    const watching = message.conversationId === this.activeId && windowFocused();
    if (message.conversationId !== this.activeId && !this.isBlocked(message.senderId)) {
      this.unread[message.conversationId] = (this.unread[message.conversationId] ?? 0) + 1;
    }
    if (
      watching ||
      focus.busy ||
      this.isBlocked(message.senderId) ||
      isCall(message) ||
      message.kind === MessageKind.EVENT
    ) {
      return;
    }

    if (preferences.values.sound) {
      playMessageSound();
    }
    if (preferences.values.notifyMessages) {
      const conversation = this.conversations.find(({ id }) => id === message.conversationId);
      const sender = this.nameOf(message.senderId);
      if (conversation?.kind === ConversationKind.GROUP) {
        notify(conversation.name, `${sender}: ${message.content}`);
      } else {
        notify(sender, message.content);
      }
    }
  }

  #update(message: Message) {
    const thread = this.threads[message.conversationId];
    if (thread) {
      thread.messages = thread.messages.map((current) =>
        current.id === message.id
          ? {
              ...message,
              senderName: message.senderName || current.senderName,
              targetName: message.targetName || current.targetName,
            }
          : current,
      );
    }

    const conversation = this.conversations.find(({ id }) => id === message.conversationId);
    if (conversation?.lastMessage?.id === message.id) {
      conversation.lastMessage = message;
    }
  }

  #upsert(conversation: Conversation) {
    for (const member of conversation.members) {
      this.#remember(member);
    }
    const index = this.conversations.findIndex(({ id }) => id === conversation.id);
    if (index === -1) {
      this.conversations.unshift(conversation);
      return;
    }
    const current = this.conversations[index];
    this.conversations[index] = { ...conversation, lastMessage: conversation.lastMessage ?? current.lastMessage };
  }

  #removeConversation(conversationId: string) {
    this.conversations = this.conversations.filter(({ id }) => id !== conversationId);
    delete this.threads[conversationId];
    delete this.unread[conversationId];
    if (this.activeId === conversationId) {
      this.showFriends();
    }
    groupCall.conversationGone(conversationId);
  }

  #groupCallUpdated(conversationId: string, call: GroupCall | undefined) {
    const conversation = this.conversations.find(({ id }) => id === conversationId);
    if (conversation) {
      conversation.call = call;
    }
    groupCall.update(conversationId, call);
  }

  #remember(user: User | undefined) {
    if (user?.id && user.username) {
      this.names[user.id] = user.username;
    }
  }

  #rememberMessage(message: Message) {
    if (message.senderName) {
      this.names[message.senderId] ??= message.senderName;
    }
    if (message.targetId && message.targetName) {
      this.names[message.targetId] ??= message.targetName;
    }
  }

  #presence(userId: string, presence: Presence) {
    if (this.user?.id === userId) {
      this.user.presence = presence;
      focus.busy = presence === Presence.BUSY;
      return;
    }

    for (const { user } of this.friends) {
      if (user?.id === userId) {
        user.presence = presence;
      }
    }
    this.#peerPresence(userId, presence);
  }

  #friend(friend: Friend, pushed = false) {
    const id = friend.user!.id;
    const known = this.friends.some(({ user }) => user?.id === id);
    this.friends = [...this.friends.filter(({ user }) => user?.id !== id), friend].sort((a, b) =>
      a.user!.username.localeCompare(b.user!.username),
    );

    if (friend.state === FriendState.ACCEPTED) {
      this.#peerPresence(id, friend.user!.presence);
    }
    if (pushed && !known && !focus.busy && friend.state === FriendState.INCOMING && preferences.values.notifyRequests) {
      notify("Ludra", t("notifications.friendRequest", { name: friend.user!.username }));
    }
  }

  #unfriend(userId: string) {
    this.friends = this.friends.filter(({ user }) => user?.id !== userId);
    this.#peerPresence(userId, Presence.OFFLINE);
  }

  #userUpdated(updated: User) {
    if (this.user?.id === updated.id) {
      this.user.avatar = updated.avatar;
    }
    for (const { user } of this.friends) {
      if (user?.id === updated.id) {
        user.avatar = updated.avatar;
      }
    }
    for (const { peer } of this.conversations) {
      if (peer?.id === updated.id) {
        peer.avatar = updated.avatar;
      }
    }
  }

  #peerPresence(userId: string, presence: Presence) {
    for (const { peer } of this.conversations) {
      if (peer?.id === userId) {
        peer.presence = presence;
      }
    }
  }

  #reset(notice: string) {
    focus.busy = false;
    this.groupPhotoError = null;
    window.clearTimeout(this.#photoTimer);
    calls.detach();
    groupCall.detach();
    trust.detach();
    this.#client = null;
    this.user = null;
    this.email = "";
    this.twoFactor = false;
    this.view = "friends";
    this.conversations = [];
    this.friends = [];
    this.blocked = [];
    this.activeId = null;
    this.threads = {};
    this.unread = {};
    this.notice = notice;
  }
}

function merge(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

export const chat = new ChatStore();
