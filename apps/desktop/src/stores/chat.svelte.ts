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
import { playMessageSound, windowFocused } from "@/services/desktop";
import { serverUrl } from "@/services/server";
import { clearSessionToken, readSessionToken, saveSessionToken } from "@/services/session-token";
import { callTarget, friendsTarget, onToastOpen, showToast } from "@/services/toast";
import { calls } from "@/stores/call.svelte";
import { focus } from "@/stores/focus";
import { groupCall } from "@/stores/group-call.svelte";
import { toProtoPresence } from "@/constants/presence";
import { preferences } from "@/stores/preferences.svelte";
import { presenceStore } from "@/stores/presence.svelte";
import { profileStore } from "@/stores/profile.svelte";
import { trust } from "@/stores/trust.svelte";
import { updates } from "@/stores/updates.svelte";
import type { UserProfile } from "@/services/profile-api";

type Thread = {
  messages: Message[];
  hasMore: boolean;
  loading: boolean;
};

export type View = "friends" | "settings";

export type SidebarTab = "direct" | "group";

export type Next = { verify: string } | { twoFactor: string } | null;

const retryDelays = [1000, 2000, 4000, 8000, 15_000];
const offlineAfter = 15_000;

class ChatStore {
  user = $state<User | null>(null);
  email = $state("");
  twoFactor = $state(false);
  renamedAt = $state<number | null>(null);
  restoring = $state(true);
  reconnecting = $state(false);
  offline = $state(false);
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
  groupTags = $state<Record<string, string>>({});

  active = $derived(this.conversations.find((conversation) => conversation.id === this.activeId) ?? null);
  thread = $derived(this.activeId ? this.threads[this.activeId] : undefined);
  incoming = $derived(this.friends.filter(({ state }) => state === FriendState.INCOMING).length);
  directs = $derived(this.conversations.filter(({ kind }) => kind !== ConversationKind.GROUP));
  groups = $derived(this.conversations.filter(({ kind }) => kind === ConversationKind.GROUP));

  #client: Client | null = null;
  #challenge: Client | null = null;
  #photoTimer: number | undefined;
  #offlineTimer: number | undefined;
  #generation = 0;

  constructor() {
    this.#restore();
    onToastOpen((target) => this.#openTarget(target));
    profileStore.onProfileSaved((profile) => this.syncMyProfile(profile));
    presenceStore.onStatusChanged((userId, status) => {
      if (this.user && this.user.id === userId) {
        this.#presence(userId, toProtoPresence(status));
      }
    });
  }

  /**
   * Sincroniza o perfil salvo no ProfileEditor com o estado global do app
   * (sidebar, mensagens, lista de membros e ProfileCard).
   */
  syncMyProfile(profile: UserProfile) {
    if (!this.user || this.user.id !== profile.id) {
      return;
    }

    const nextUser: User = {
      ...this.user,
      username: profile.displayName || this.user.username,
      avatar: profile.avatar,
      presence: toProtoPresence(profile.status),
    };

    this.user = nextUser;
    this.names[profile.id] = nextUser.username;

    for (const conversation of this.conversations) {
      if (conversation.peer?.id === profile.id) {
        conversation.peer = nextUser;
      }
      conversation.members = conversation.members.map((member) => (member.id === profile.id ? nextUser : member));
    }
  }

  #openTarget(target: string) {
    if (!this.user || target === callTarget) {
      return;
    }
    if (target === friendsTarget) {
      this.showFriends();
      return;
    }
    const conversation = this.conversations.find(({ id }) => id === target);
    if (conversation) {
      this.sidebarTab = conversation.kind === ConversationKind.GROUP ? "group" : "direct";
      this.select(conversation.id).catch(() => undefined);
    }
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

    if (!token && import.meta.env.DEV) {
      const savedMe = profileStore.cache["local-preview"];
      const savedPresence = presenceStore.getRecord("local-preview");
      const me: User = {
        $typeName: "ludra.v1.User",
        id: "local-preview",
        username: savedMe?.displayName || "felikovizk",
        avatar: savedMe?.avatar || "",
        presence: toProtoPresence(savedPresence.status),
      };
      const dexty: User = {
        $typeName: "ludra.v1.User",
        id: "peer-1",
        username: "dexty",
        avatar: "",
        presence: Presence.ONLINE,
      };
      const felipe: User = {
        $typeName: "ludra.v1.User",
        id: "peer-2",
        username: "felipe_dev",
        avatar: "",
        presence: Presence.ONLINE,
      };
      const gabriel: User = {
        $typeName: "ludra.v1.User",
        id: "peer-3",
        username: "gpaschoal01",
        avatar: "",
        presence: Presence.ONLINE,
      };
      const ghost: User = {
        $typeName: "ludra.v1.User",
        id: "peer-4",
        username: "ghost_gamer",
        avatar: "",
        presence: Presence.INVISIBLE,
      };

      this.user = me;
      this.names = {
        [me.id]: me.username,
        [dexty.id]: dexty.username,
        [felipe.id]: felipe.username,
        [gabriel.id]: gabriel.username,
        [ghost.id]: ghost.username,
      };
      this.friends = [
        { $typeName: "ludra.v1.Friend", user: dexty, state: FriendState.ACCEPTED },
        { $typeName: "ludra.v1.Friend", user: felipe, state: FriendState.ACCEPTED },
        { $typeName: "ludra.v1.Friend", user: gabriel, state: FriendState.ACCEPTED },
        { $typeName: "ludra.v1.Friend", user: ghost, state: FriendState.ACCEPTED },
      ];

      const now = Math.floor(Date.now() / 1000);
      const msg1: Message = {
        $typeName: "ludra.v1.Message",
        id: "msg-1",
        conversationId: "preview-group-1",
        senderId: dexty.id,
        senderName: dexty.username,
        content: "Bora fechar squad no Valorant? Clica no meu perfil pra ver o GIF animado de fundo!",
        sentAt: { $typeName: "google.protobuf.Timestamp", seconds: BigInt(now - 180), nanos: 0 },
        kind: MessageKind.TEXT,
        callOutcome: 0,
        callDuration: 0,
        event: 0,
        targetId: "",
        targetName: "",
      };
      const msg2: Message = {
        $typeName: "ludra.v1.Message",
        id: "msg-2",
        conversationId: "preview-group-1",
        senderId: felipe.id,
        senderName: felipe.username,
        content: "Tô terminando de estudar aqui, já entro! (Perfil com banner estático)",
        sentAt: { $typeName: "google.protobuf.Timestamp", seconds: BigInt(now - 90), nanos: 0 },
        kind: MessageKind.TEXT,
        callOutcome: 0,
        callDuration: 0,
        event: 0,
        targetId: "",
        targetName: "",
      };
      const msg3: Message = {
        $typeName: "ludra.v1.Message",
        id: "msg-3",
        conversationId: "preview-group-1",
        senderId: gabriel.id,
        senderName: gabriel.username,
        content: "Fechou, só terminar essa ranqueada! (Perfil com cor sólida)",
        sentAt: { $typeName: "google.protobuf.Timestamp", seconds: BigInt(now - 20), nanos: 0 },
        kind: MessageKind.TEXT,
        callOutcome: 0,
        callDuration: 0,
        event: 0,
        targetId: "",
        targetName: "",
      };

      this.conversations = [
        {
          $typeName: "ludra.v1.Conversation",
          id: "preview-dm-1",
          kind: ConversationKind.DIRECT,
          name: "",
          avatar: "",
          ownerId: "",
          peer: dexty,
          members: [me, dexty],
          lastMessage: msg1,
        },
        {
          $typeName: "ludra.v1.Conversation",
          id: "preview-dm-2",
          kind: ConversationKind.DIRECT,
          name: "",
          avatar: "",
          ownerId: "",
          peer: gabriel,
          members: [me, gabriel],
          lastMessage: msg3,
        },
        {
          $typeName: "ludra.v1.Conversation",
          id: "preview-group-1",
          kind: ConversationKind.GROUP,
          name: "Galera do Game",
          avatar: "",
          ownerId: me.id,
          members: [me, dexty, felipe, gabriel, ghost],
          lastMessage: msg1,
        },
        {
          $typeName: "ludra.v1.Conversation",
          id: "preview-group-2",
          kind: ConversationKind.GROUP,
          name: "Trabalho - Projeto",
          avatar: "",
          ownerId: me.id,
          members: [me, felipe],
          lastMessage: {
            $typeName: "ludra.v1.Message",
            id: "msg-work",
            conversationId: "preview-group-2",
            senderId: me.id,
            senderName: me.username,
            content: "Beleza, vou enviar",
            sentAt: {
              $typeName: "google.protobuf.Timestamp",
              seconds: BigInt(now - 86_400),
              nanos: 0,
            },
            kind: MessageKind.TEXT,
            callOutcome: 0,
            callDuration: 0,
            event: 0,
            targetId: "",
            targetName: "",
          },
        },
        {
          $typeName: "ludra.v1.Conversation",
          id: "preview-group-3",
          kind: ConversationKind.GROUP,
          name: "Estudos",
          avatar: "",
          ownerId: felipe.id,
          members: [me, dexty, felipe],
          lastMessage: {
            $typeName: "ludra.v1.Message",
            id: "msg-study",
            conversationId: "preview-group-3",
            senderId: felipe.id,
            senderName: felipe.username,
            content: "Amanhã às 14h",
            sentAt: {
              $typeName: "google.protobuf.Timestamp",
              seconds: BigInt(now - 4 * 86_400),
              nanos: 0,
            },
            kind: MessageKind.TEXT,
            callOutcome: 0,
            callDuration: 0,
            event: 0,
            targetId: "",
            targetName: "",
          },
        },
      ];
      this.unread = { "preview-group-1": 3 };
      this.groupTags = { "preview-group-2": "Importante" };
      this.sidebarTab = "group";
      this.activeId = "preview-group-1";
      this.threads = {
        "preview-group-1": { messages: [msg1, msg2, msg3], hasMore: false, loading: false },
        "preview-group-2": { messages: [], hasMore: false, loading: false },
        "preview-group-3": { messages: [], hasMore: false, loading: false },
        "preview-dm-1": { messages: [msg1], hasMore: false, loading: false },
        "preview-dm-2": { messages: [msg3], hasMore: false, loading: false },
      };
    }

    this.restoring = false;
  }

  async #authenticate(
    start: (client: Client) => Promise<SignIn>,
    existing?: Client,
    wanted: () => boolean = () => true,
  ): Promise<Next> {
    const client = existing ?? (await Client.connect(serverUrl));

    try {
      const result = await start(client);
      if (!wanted()) {
        throw new Error(t("common.connectionLost"));
      }
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
    client.onMessageDeleted = (conversationId, messageId, last) => this.#deleted(conversationId, messageId, last);
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
    updates.check();
    await trust.attach(client, account.user.id).catch(() => undefined);
    calls.attach(client);
    groupCall.attach(client);
    groupCall.friendly = (userId) => this.isFriend(userId);

    this.#client = client;
    this.user = account.user;
    focus.busy = account.user.presence === Presence.BUSY;
    this.email = account.email;
    this.twoFactor = account.twoFactor;
    this.renamedAt = account.renamedAt;
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
    this.threads = {};
    this.view = "friends";
    this.notice = "";
  }

  async #reconnect() {
    const token = readSessionToken();
    if (!token) {
      this.#reset(t("common.connectionLost"));
      return;
    }

    const voice = groupCall.snapshot();
    this.#suspend();
    const generation = this.#generation;
    const wanted = () => generation === this.#generation;
    this.reconnecting = true;
    this.#offlineTimer = window.setTimeout(() => (this.offline = true), offlineAfter);

    let view = this.view;
    for (let attempt = 0; wanted(); attempt++) {
      view = this.view;
      try {
        await this.#authenticate((client) => client.resume(token), undefined, wanted);
        break;
      } catch (error) {
        if (!wanted()) {
          return;
        }
        if (error instanceof ServerError && error.code === ErrorCode.UNAUTHENTICATED) {
          clearSessionToken();
          this.#reset(t("common.connectionLost"));
          return;
        }
        const delay = retryDelays[Math.min(attempt, retryDelays.length - 1)] * (0.75 + Math.random() * 0.5);
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
    }
    if (!wanted()) {
      return;
    }
    this.#online();

    const user = this.user;
    if (!user) {
      return;
    }
    this.view = view;
    const activeId = this.activeId;
    if (activeId && this.conversations.some(({ id }) => id === activeId)) {
      await this.select(activeId).catch(() => undefined);
    } else {
      this.activeId = null;
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
    if (!this.#client) {
      const id = `local-group-${Date.now()}`;
      const members = [
        ...(this.user ? [this.user] : []),
        ...this.friends.map(({ user }) => user).filter((u): u is User => Boolean(u && memberIds.includes(u.id))),
      ];
      const conversation: Conversation = {
        $typeName: "ludra.v1.Conversation",
        id,
        kind: ConversationKind.GROUP,
        name,
        avatar: "",
        ownerId: this.user?.id ?? "",
        members,
      };
      this.conversations = [conversation, ...this.conversations];
      this.threads[id] = { messages: [], hasMore: false, loading: false };
      this.sidebarTab = "group";
      await this.select(id);
      return;
    }
    const conversation = await this.#client.createGroup(name, memberIds);
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

  async renameGroup(conversationId: string, name: string) {
    this.#upsert(await this.#client!.renameGroup(conversationId, name));
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
    if (this.#client) {
      await this.#client.setPresence(presence);
    }
    if (this.user) {
      this.#presence(this.user.id, presence);
    }
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

  async setUsername(username: string) {
    this.#userUpdated(await this.#client!.setUsername(username));
    this.renamedAt = Date.now();
  }

  async editMessage(messageId: string, content: string) {
    this.#update(await this.#client!.editMessage(messageId, content));
  }

  async deleteMessage(messageId: string) {
    const { conversationId, lastMessage } = await this.#client!.deleteMessage(messageId);
    this.#deleted(conversationId, messageId, lastMessage);
  }

  async select(conversationId: string) {
    this.activeId = conversationId;
    delete this.unread[conversationId];

    if (!this.threads[conversationId]) {
      await this.#load(conversationId);
    }
  }

  async start(username: string) {
    if (!this.#client) {
      const existing = this.directs.find(({ peer }) => peer?.username.toLowerCase() === username.toLowerCase());
      if (existing) {
        this.sidebarTab = "direct";
        await this.select(existing.id);
        return;
      }
      const friend = this.friends.find(({ user }) => user?.username.toLowerCase() === username.toLowerCase())?.user;
      const peer: User = friend ?? {
        $typeName: "ludra.v1.User",
        id: `local-peer-${username}`,
        username,
        avatar: "",
        presence: Presence.ONLINE,
      };
      const id = `local-dm-${peer.id}`;
      const conversation: Conversation = {
        $typeName: "ludra.v1.Conversation",
        id,
        kind: ConversationKind.DIRECT,
        name: "",
        avatar: "",
        ownerId: "",
        peer,
        members: this.user ? [this.user, peer] : [peer],
      };
      this.conversations = [conversation, ...this.conversations];
      this.threads[id] = { messages: [], hasMore: false, loading: false };
      this.sidebarTab = "direct";
      await this.select(id);
      return;
    }
    const conversation = await this.#client.openConversation(username);

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
    if (!this.#client) {
      if (!this.activeId || !this.user) return;
      const message: Message = {
        $typeName: "ludra.v1.Message",
        id: `local-msg-${Date.now()}`,
        conversationId: this.activeId,
        senderId: this.user.id,
        senderName: this.user.username,
        content,
        sentAt: {
          $typeName: "google.protobuf.Timestamp",
          seconds: BigInt(Math.floor(Date.now() / 1000)),
          nanos: 0,
        },
        kind: MessageKind.TEXT,
        callOutcome: 0,
        callDuration: 0,
        event: 0,
        targetId: "",
        targetName: "",
      };
      this.#receive(message);
      return;
    }
    const message = await this.#client.sendMessage(this.activeId!, content);
    this.#receive(message);
  }

  async #load(conversationId: string, beforeId = "") {
    this.threads[conversationId] ??= { messages: [], hasMore: false, loading: false };
    if (!this.#client) {
      return;
    }
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
        showToast({
          title: conversation.name,
          body: `${sender}: ${message.content}`,
          kind: "group",
          id: conversation.id,
          name: conversation.name,
          avatar: conversation.avatar,
          target: conversation.id,
        });
      } else {
        showToast({
          title: sender,
          body: message.content,
          kind: "user",
          id: message.senderId,
          name: sender,
          avatar: conversation?.peer?.avatar ?? "",
          target: message.conversationId,
        });
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

  #deleted(conversationId: string, messageId: string, last: Message | undefined) {
    const thread = this.threads[conversationId];
    if (thread) {
      thread.messages = thread.messages.filter(({ id }) => id !== messageId);
    }
    const conversation = this.conversations.find(({ id }) => id === conversationId);
    if (conversation?.lastMessage?.id === messageId) {
      conversation.lastMessage = last;
    }
    if (last) {
      this.#rememberMessage(last);
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
      showToast({
        title: friend.user!.username,
        body: t("notifications.friendRequest", { name: friend.user!.username }),
        kind: "user",
        id,
        name: friend.user!.username,
        avatar: friend.user!.avatar,
        target: friendsTarget,
      });
    }
  }

  #unfriend(userId: string) {
    this.friends = this.friends.filter(({ user }) => user?.id !== userId);
    this.#peerPresence(userId, Presence.OFFLINE);
  }

  #userUpdated(updated: User) {
    const people = [
      this.user,
      ...this.friends.map(({ user }) => user),
      ...this.conversations.flatMap(({ peer, members }) => [peer, ...members]),
      ...this.blocked,
    ];
    for (const person of people) {
      if (person?.id === updated.id) {
        person.avatar = updated.avatar;
        person.username = updated.username || person.username;
      }
    }
    this.#remember(updated);
  }

  #peerPresence(userId: string, presence: Presence) {
    for (const { peer } of this.conversations) {
      if (peer?.id === userId) {
        peer.presence = presence;
      }
    }
  }

  #suspend() {
    calls.detach();
    groupCall.detach();
    trust.detach();
    this.#client = null;
  }

  #online() {
    window.clearTimeout(this.#offlineTimer);
    this.reconnecting = false;
    this.offline = false;
  }

  #reset(notice: string) {
    this.#generation++;
    this.#online();
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
    this.renamedAt = null;
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
