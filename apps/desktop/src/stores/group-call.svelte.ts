import { t } from "@/i18n";
import { SignalKind, type CallSignal, type GroupCall, type User } from "@/protocol/ludra/v1/models_pb";
import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
import { ServerError, type Client } from "@/services/client";
import { notify, windowFocused } from "@/services/desktop";
import { playCue, setRingtone } from "@/services/ringtone";
import { VoiceRoom } from "@/services/voice-room";
import { calls } from "@/stores/call.svelte";
import { focus } from "@/stores/focus";
import { preferences } from "@/stores/preferences.svelte";

export type GroupCurrent = {
  id: string;
  conversationId: string;
  selfId: string;
  participantIds: string[];
  startedAt: number;
};

export type Ringing = {
  conversationId: string;
  starter: User;
  hidden?: boolean;
};

type PeerState = { muted: boolean; deafened: boolean };

const ringTimeout = 30_000;

class GroupCallStore {
  current = $state<GroupCurrent | null>(null);
  ringing = $state<Ringing | null>(null);
  joining = $state(false);
  muted = $state(false);
  deafened = $state(false);
  speaking = $state<Set<string>>(new Set());
  states = $state<Record<string, PeerState>>({});
  latency = $state<number | null>(null);
  error = $state("");

  #client: Client | null = null;
  #room: VoiceRoom | null = null;
  #started: Promise<void> = Promise.resolve();
  #mutedBeforeDeafen = false;
  #beforeTest: { muted: boolean; deafened: boolean } | null = null;
  #ringTimer: number | undefined;
  #calling = false;
  #latest = new Map<string, GroupCall>();
  #callingTimer: number | undefined;
  #errorTimer: number | undefined;

  attach(client: Client) {
    this.#client = client;
    calls.onBeforeAnswer = () => this.leave();
    const direct = client.onCallSignal;
    client.onCallSignal = (signal) => {
      if (this.current && signal.callId === this.current.id) {
        this.#signal(signal);
      } else {
        direct(signal);
      }
    };
  }

  detach() {
    this.#dismiss();
    this.#finish();
    this.#latest.clear();
    this.#client = null;
  }

  async join(conversationId: string, selfId: string) {
    if (!this.#client || this.joining || this.current?.conversationId === conversationId) {
      return;
    }
    if (this.current) {
      await this.leave();
    }
    if (calls.current) {
      await calls.hangUp();
    }

    this.#dismiss();
    this.joining = true;
    let room: VoiceRoom | null = null;
    try {
      const joined = await this.#client.joinGroupCall(conversationId);
      room = new VoiceRoom(joined.iceServers, selfId);
      this.#room = room;
      this.current = {
        id: joined.callId,
        conversationId,
        selfId,
        participantIds: [selfId, ...joined.participantIds],
        startedAt: Date.now(),
      };
      this.#wire(room);
      this.#started = room.start();
      await this.#started;
      room.setMuted(this.muted);
      const alone = this.current?.participantIds.length === 1;
      if (alone && this.#latest.get(conversationId)?.ringingIds.length) {
        this.#startCalling();
      } else if (!alone || joined.participantIds.length > 0) {
        playCue("connected");
      }
      for (const peerId of joined.participantIds) {
        await room.connect(peerId);
      }
    } catch (cause) {
      if (room && this.#room !== room) {
        return;
      }
      this.#showError(describe(cause));
      if (this.current) {
        await this.leave();
      } else {
        room?.close();
        this.#room = null;
      }
    } finally {
      this.joining = false;
    }
  }

  async leave() {
    const current = this.current;
    this.#finish();
    if (current) {
      await this.#client?.leaveGroupCall(current.id).catch(() => undefined);
    }
  }

  ring(conversationId: string, starter: User) {
    if (
      focus.busy ||
      this.current?.conversationId === conversationId ||
      this.joining ||
      calls.current?.status === "incoming"
    ) {
      return;
    }
    this.ringing = { conversationId, starter };
    this.#syncRing();
    window.clearTimeout(this.#ringTimer);
    this.#ringTimer = window.setTimeout(() => this.#dismiss(), ringTimeout);
    if (!windowFocused()) {
      notify("Ludra", t("group.ringNotification", { name: starter.username }));
    }
  }

  hide() {
    if (this.ringing) {
      this.ringing.hidden = true;
      this.#syncRing();
    }
  }

  decline() {
    const ringing = this.ringing;
    this.#dismiss();
    if (ringing) {
      this.#client?.declineGroupCall(ringing.conversationId).catch(() => undefined);
    }
  }

  update(conversationId: string, call: GroupCall | undefined) {
    if (call) {
      this.#latest.set(conversationId, call);
    } else {
      this.#latest.delete(conversationId);
    }
    if (this.ringing?.conversationId === conversationId && !call) {
      this.#dismiss();
    }

    const current = this.current;
    if (!current || current.conversationId !== conversationId) {
      return;
    }
    if (!call) {
      this.#finish();
      return;
    }
    if (!call.participantIds.includes(current.selfId)) {
      this.#finish();
      return;
    }

    const joined = call.participantIds.filter((id) => !current.participantIds.includes(id));
    const left = current.participantIds.filter((id) => !call.participantIds.includes(id));

    if (this.#calling && (call.participantIds.length > 1 || !call.ringingIds.length)) {
      this.#stopCalling();
    }
    if (joined.length) {
      playCue("connected");
    } else if (left.length) {
      playCue("ended");
    }

    for (const peerId of left) {
      this.#room?.remove(peerId);
      delete this.states[peerId];
    }
    current.participantIds = call.participantIds;
  }

  conversationGone(conversationId: string) {
    if (this.ringing?.conversationId === conversationId) {
      this.#dismiss();
    }
    if (this.current?.conversationId === conversationId) {
      this.#finish();
    }
  }

  toggleMute() {
    if (this.deafened) {
      this.toggleDeafen();
      return;
    }
    this.muted = !this.muted;
    playCue(this.muted ? "off" : "on");
    this.#room?.setMuted(this.muted);
    this.#shareState();
  }

  toggleDeafen() {
    this.deafened = !this.deafened;
    playCue(this.deafened ? "off" : "on");
    if (this.deafened) {
      this.#mutedBeforeDeafen = this.muted;
      this.muted = true;
    } else {
      this.muted = this.#mutedBeforeDeafen;
    }
    this.#room?.setMuted(this.muted);
    this.#room?.setDeafened(this.deafened);
    this.#shareState();
  }

  beginVoiceTest() {
    if (!this.current || this.#beforeTest) {
      return;
    }
    this.#beforeTest = { muted: this.muted, deafened: this.deafened };
    this.#apply(true, true);
  }

  endVoiceTest() {
    const before = this.#beforeTest;
    this.#beforeTest = null;
    if (before && this.current) {
      this.#apply(before.muted, before.deafened);
    }
  }

  setInputVolume(percent: number) {
    this.#room?.microphone?.setVolume(percent);
  }

  setSensitivity(percent: number) {
    this.#room?.microphone?.setSensitivity(percent);
  }

  setNoiseSuppression(percent: number) {
    this.#room?.microphone?.setSuppression(percent).catch(() => undefined);
  }

  setPeerVolume(userId: string, percent: number) {
    this.#room?.setPeerVolume(userId, percent);
  }

  setOutputVolume(percent: number) {
    this.#room?.setOutputVolume(percent);
  }

  setOutputDevice(deviceId: string) {
    this.#room?.setOutputDevice(deviceId);
  }

  #wire(room: VoiceRoom) {
    room.onSignal = (peerId, kind, payload) => {
      const current = this.current;
      if (current) {
        this.#client?.sendSignal(current.id, kind, payload, peerId).catch(() => undefined);
      }
    };
    room.onSpeaking = (speaking) => (this.speaking = speaking);
    room.onLatency = (milliseconds) => (this.latency = room.peers().length ? milliseconds : null);
    room.onPeerConnected = () => this.#shareState();
    room.onPeerFailed = (peerId) => {
      room.remove(peerId);
      delete this.states[peerId];
    };
  }

  async #signal(signal: CallSignal) {
    const room = this.#room;
    if (!room || !signal.peerId) {
      return;
    }
    if (signal.kind === SignalKind.STATE) {
      this.states[signal.peerId] = parseState(signal.payload);
      return;
    }
    await this.#started.catch(() => undefined);
    await room.receive(signal.peerId, signal.kind, signal.payload).catch(() => {
      room.remove(signal.peerId);
    });
  }

  #apply(muted: boolean, deafened: boolean) {
    this.muted = muted;
    this.deafened = deafened;
    this.#room?.setMuted(muted);
    this.#room?.setDeafened(deafened);
    this.#shareState();
  }

  #shareState() {
    const current = this.current;
    if (!current) {
      return;
    }
    const payload = JSON.stringify({ muted: this.muted, deafened: this.deafened });
    this.#client?.sendSignal(current.id, SignalKind.STATE, payload, "*").catch(() => undefined);
  }

  #dismiss() {
    window.clearTimeout(this.#ringTimer);
    this.ringing = null;
    this.#syncRing();
  }

  #startCalling() {
    this.#calling = true;
    this.#syncRing();
    window.clearTimeout(this.#callingTimer);
    this.#callingTimer = window.setTimeout(() => this.#stopCalling(), ringTimeout);
  }

  #stopCalling() {
    window.clearTimeout(this.#callingTimer);
    this.#calling = false;
    this.#syncRing();
  }

  #syncRing() {
    if (this.ringing && !this.ringing.hidden) {
      setRingtone("group", "incoming");
    } else {
      setRingtone("group", this.#calling ? "outgoing" : null);
    }
  }

  #finish() {
    this.#beforeTest = null;
    this.#stopCalling();
    if (this.current) {
      playCue("ended");
    }
    this.#room?.close();
    this.#room = null;
    this.current = null;
    this.muted = false;
    this.deafened = false;
    this.speaking = new Set();
    this.states = {};
    this.latency = null;
  }

  #showError(message: string) {
    this.error = message;
    window.clearTimeout(this.#errorTimer);
    this.#errorTimer = window.setTimeout(() => (this.error = ""), 4000);
  }
}

function parseState(payload: string): PeerState {
  try {
    const state = JSON.parse(payload);
    return { muted: state?.muted === true, deafened: state?.deafened === true };
  } catch {
    return { muted: false, deafened: false };
  }
}

function describe(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === "NotAllowedError") {
    return t("call.microphoneDenied");
  }
  if (cause instanceof DOMException) {
    return t("call.microphoneMissing");
  }
  if (cause instanceof ServerError && cause.code === ErrorCode.UNAVAILABLE) {
    return t("group.callBusy");
  }
  if (cause instanceof ServerError && cause.code === ErrorCode.TOO_MANY_REQUESTS) {
    return t("common.tooManyRequests");
  }
  return t("call.failed");
}

export const groupCall = new GroupCallStore();
