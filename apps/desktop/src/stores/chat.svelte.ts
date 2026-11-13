import { t } from "@/i18n";
import type { CodePurpose } from "@/protocol/ludra/v1/client_pb";
import {
  FriendState,
  Presence,
  type Conversation,
  type Friend,
  type Message,
  type User,
} from "@/protocol/ludra/v1/models_pb";
import { Client, ServerError, type Account, type SignIn } from "@/services/client";
import { notify, playMessageSound, windowFocused } from "@/services/desktop";
import { serverUrl } from "@/services/server";
import { clearSessionToken, readSessionToken, saveSessionToken } from "@/services/session-token";
import { preferences } from "@/stores/preferences.svelte";

type Thread = {
  messages: Message[];
  hasMore: boolean;
  loading: boolean;
};

export type View = "friends" | "settings";

export type Next = { verify: string } | { twoFactor: string } | null;

class ChatStore {
  user = $state<User | null>(null);
  email = $state("");
  twoFactor = $state(false);
  restoring = $state(true);
  notice = $state("");
  view = $state<View>("friends");
  conversations = $state<Conversation[]>([]);
  friends = $state<Friend[]>([]);
  activeId = $state<string | null>(null);
  threads = $state<Record<string, Thread>>({});
  unread = $state<Record<string, number>>({});

  active = $derived(this.conversations.find((conversation) => conversation.id === this.activeId) ?? null);
  thread = $derived(this.activeId ? this.threads[this.activeId] : undefined);
  incoming = $derived(this.friends.filter(({ state }) => state === FriendState.INCOMING).length);

  #client: Client | null = null;
  #challenge: Client | null = null;

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
    const [conversations, friends] = await Promise.all([client.listConversations(), client.listFriends()]);
    saveSessionToken(account.token);

    client.onMessage = (message) => this.#receive(message);
    client.onPresence = (userId, presence) => this.#presence(userId, presence);
    client.onFriend = (friend) => this.#friend(friend, true);
    client.onFriendRemoved = (userId) => this.#unfriend(userId);
    client.onUserUpdated = (user) => this.#userUpdated(user);
    client.onTwoFactorChanged = (enabled) => (this.twoFactor = enabled);
    client.onClose = () => this.#reset(t("common.connectionLost"));

    this.#client = client;
    this.user = account.user;
    this.email = account.email;
    this.twoFactor = account.twoFactor;
    this.conversations = conversations;
    this.friends = friends;
    this.view = "friends";
    this.notice = "";
  }

  showFriends() {
    this.activeId = null;
    this.view = "friends";
  }

  showSettings() {
    this.activeId = null;
    this.view = "settings";
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
    if (message.conversationId !== this.activeId) {
      this.unread[message.conversationId] = (this.unread[message.conversationId] ?? 0) + 1;
    }
    if (watching) {
      return;
    }

    if (preferences.values.sound) {
      playMessageSound();
    }
    if (preferences.values.notifyMessages) {
      const sender = this.conversations.find(({ id }) => id === message.conversationId)?.peer;
      notify(sender?.username ?? "Ludra", message.content);
    }
  }

  #presence(userId: string, presence: Presence) {
    if (this.user?.id === userId) {
      this.user.presence = presence;
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
    if (pushed && !known && friend.state === FriendState.INCOMING && preferences.values.notifyRequests) {
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
    this.#client = null;
    this.user = null;
    this.email = "";
    this.twoFactor = false;
    this.view = "friends";
    this.conversations = [];
    this.friends = [];
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
