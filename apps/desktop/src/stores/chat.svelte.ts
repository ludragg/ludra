import type { CodePurpose } from "@/protocol/ludra/v1/client_pb";
import type { Conversation, Message, Presence, User } from "@/protocol/ludra/v1/models_pb";
import { Client, ServerError, type SignIn } from "@/services/client";
import { clearSessionToken, readSessionToken, saveSessionToken } from "@/services/session-token";

const serverUrl = import.meta.env.VITE_LUDRA_SERVER ?? "ws://127.0.0.1:8080/ws";

type Thread = {
  messages: Message[];
  hasMore: boolean;
  loading: boolean;
};

class ChatStore {
  user = $state<User | null>(null);
  restoring = $state(true);
  notice = $state("");
  conversations = $state<Conversation[]>([]);
  activeId = $state<string | null>(null);
  threads = $state<Record<string, Thread>>({});
  unread = $state<Record<string, number>>({});

  active = $derived(this.conversations.find((conversation) => conversation.id === this.activeId) ?? null);
  thread = $derived(this.activeId ? this.threads[this.activeId] : undefined);

  #client: Client | null = null;

  constructor() {
    this.#restore();
  }

  register(email: string, username: string, password: string) {
    return this.#authenticate((client) => client.register(email, username, password));
  }

  login(login: string, password: string) {
    return this.#authenticate((client) => client.login(login, password));
  }

  verifyEmail(email: string, code: string) {
    return this.#authenticate((client) => client.verifyEmail(email, code));
  }

  resetPassword(email: string, code: string, password: string) {
    return this.#authenticate((client) => client.resetPassword(email, code, password));
  }

  async sendCode(email: string, purpose: CodePurpose) {
    const client = await Client.connect(serverUrl);
    try {
      await client.sendCode(email, purpose);
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
          this.notice = "Não foi possível conectar ao servidor.";
        }
      }
    }

    this.restoring = false;
  }

  async #authenticate(start: (client: Client) => Promise<SignIn>): Promise<string | null> {
    const client = await Client.connect(serverUrl);

    try {
      const result = await start(client);
      if ("pendingEmail" in result) {
        client.close();
        return result.pendingEmail;
      }

      const { user, token } = result.account;
      const conversations = await client.listConversations();
      saveSessionToken(token);

      client.onMessage = (message) => this.#receive(message);
      client.onPresence = (userId, presence) => this.#presence(userId, presence);
      client.onClose = () => this.#reset("Conexão com o servidor perdida.");

      this.#client = client;
      this.user = user;
      this.conversations = conversations;
      this.notice = "";
      return null;
    } catch (error) {
      client.close();
      throw error;
    }
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

    if (message.senderId !== this.user?.id && message.conversationId !== this.activeId) {
      this.unread[message.conversationId] = (this.unread[message.conversationId] ?? 0) + 1;
    }
  }

  #presence(userId: string, presence: Presence) {
    for (const { peer } of this.conversations) {
      if (peer?.id === userId) {
        peer.presence = presence;
      }
    }
  }

  #reset(notice: string) {
    this.#client = null;
    this.user = null;
    this.conversations = [];
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
