import { SignalKind } from "@/protocol/ludra/v1/models_pb";
import type { Client } from "@/services/client";
import { loadIdentity, safetyNumber, signText, verifyText, type Identity } from "@/services/identity";

type Sealed = { d: string; s: string };

const signedKinds = new Set([SignalKind.OFFER, SignalKind.ANSWER, SignalKind.STREAM_OFFER, SignalKind.STREAM_ANSWER]);

function pinsKey(userId: string): string {
  return `ludra.pins.${userId}`;
}

class TrustStore {
  changed = $state<Record<string, string>>({});

  #client: Client | null = null;
  #selfId = "";
  #identity: Identity | null = null;
  #keys = new Map<string, string>();
  #pins: Record<string, string> = {};

  async attach(client: Client, selfId: string) {
    this.#client = client;
    this.#selfId = selfId;
    this.#keys.clear();
    this.changed = {};
    this.#pins = this.#loadPins();
    this.#identity = await loadIdentity(selfId);
    await client.setIdentityKey(this.#identity.publicKey);
  }

  detach() {
    this.#client = null;
    this.#identity = null;
    this.#keys.clear();
    this.changed = {};
  }

  async prepare(userIds: string[]) {
    const missing = userIds.filter((id) => id !== this.#selfId);
    if (!this.#client || missing.length === 0) {
      return;
    }
    const keys = await this.#client.listIdentityKeys(missing);
    for (const id of missing) {
      const key = keys[id];
      if (key) {
        this.#remember(id, key);
      }
    }
  }

  async seal(callId: string, peerId: string, kind: SignalKind, payload: string): Promise<string> {
    if (!signedKinds.has(kind)) {
      return payload;
    }
    if (!this.#identity) {
      throw new Error("identity unavailable");
    }
    const proof = await signText(
      this.#identity.privateKey,
      this.#statement(callId, this.#selfId, peerId, kind, payload),
    );
    return JSON.stringify({ d: payload, s: proof } satisfies Sealed);
  }

  async open(callId: string, peerId: string, kind: SignalKind, payload: string): Promise<string> {
    if (!signedKinds.has(kind)) {
      return payload;
    }
    const sealed = JSON.parse(payload) as Partial<Sealed>;
    if (typeof sealed.d !== "string" || typeof sealed.s !== "string") {
      throw new Error("unverified signal");
    }
    const statement = this.#statement(callId, peerId, this.#selfId, kind, sealed.d);
    if (this.#keys.has(peerId) && (await this.#verify(peerId, statement, sealed.s))) {
      return sealed.d;
    }
    await this.prepare([peerId]);
    if (await this.#verify(peerId, statement, sealed.s)) {
      return sealed.d;
    }
    throw new Error("invalid signature");
  }

  async #verify(peerId: string, statement: string, proof: string): Promise<boolean> {
    const key = this.#keys.get(peerId);
    return key ? verifyText(key, statement, proof) : false;
  }

  async safetyNumber(peerId: string): Promise<string | null> {
    const key = this.#keys.get(peerId);
    if (!this.#identity || !key) {
      return null;
    }
    return safetyNumber([this.#selfId, this.#identity.publicKey], [peerId, key]);
  }

  accept(peerId: string) {
    const key = this.#keys.get(peerId);
    if (!key) {
      return;
    }
    this.#pins[peerId] = key;
    this.#savePins();
    delete this.changed[peerId];
  }

  #remember(peerId: string, key: string) {
    this.#keys.set(peerId, key);
    const pinned = this.#pins[peerId];
    if (!pinned) {
      this.#pins[peerId] = key;
      this.#savePins();
    } else if (pinned !== key) {
      this.changed[peerId] = key;
    } else {
      delete this.changed[peerId];
    }
  }

  #statement(callId: string, from: string, to: string, kind: SignalKind, payload: string): string {
    return ["ludra-call", callId, from, to, String(kind), payload].join("|");
  }

  #loadPins(): Record<string, string> {
    try {
      const saved = JSON.parse(localStorage.getItem(pinsKey(this.#selfId)) ?? "{}");
      return saved && typeof saved === "object" ? saved : {};
    } catch {
      return {};
    }
  }

  #savePins() {
    try {
      localStorage.setItem(pinsKey(this.#selfId), JSON.stringify(this.#pins));
    } catch {
      return;
    }
  }
}

export const trust = new TrustStore();
