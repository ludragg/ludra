import { Client } from "@/services/client";
import type { Conversation, Message, Presence, User } from "@/protocol/ludra/v1/models_pb";

const serverUrl = import.meta.env.VITE_LUDRA_SERVER ?? "ws://127.0.0.1:8080/ws";

type Thread = {
  messages: Message[];
  hasMore: boolean;
  loading: boolean;
};

class ChatStore {
  user = $state<User | null>(null);
  connecting = $state(false);
  error = $state("");
  conversations = $state<Conversation[]>([]);
  activeId = $state<string | null>(null);
  threads = $state<Record<string, Thread>>({});
  unread = $state<Record<string, number>>({});

  active = $derived(this.conversations.find((conversation) => conversation.id === this.activeId) ?? null);
  thread = $derived(this.activeId ? this.threads[this.activeId] : undefined);

  #client: Client | null = null;

  async login(username: string) {
    this.connecting = true;
    this.error = "";
    let client: Client | null = null;

    try {
      client = await Client.connect(serverUrl);
      const user = await client.login(username);
      const conversations = await client.listConversations();

      client.onMessage = (message) => this.#receive(message);
      client.onPresence = (userId, presence) => this.#presence(userId, presence);
      client.onClose = () => this.#reset("Conexão com o servidor perdida.");

      this.#client = client;
      this.user = user;
      this.conversations = conversations;
    } catch (error) {
      client?.close();
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.connecting = false;
    }
  }

  logout() {
    this.#client?.close();
    this.#reset("");
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

  #reset(error: string) {
    this.#client = null;
    this.user = null;
    this.conversations = [];
    this.activeId = null;
    this.threads = {};
    this.unread = {};
    this.error = error;
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
