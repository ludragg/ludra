import { t } from "@/i18n";
import { SignalKind, type Call, type CallSignal, type IceServer, type User } from "@/protocol/ludra/v1/models_pb";
import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
import { ServerError, type Client } from "@/services/client";
import { notify, windowFocused } from "@/services/desktop";
import { playCue, setRingtone } from "@/services/ringtone";
import { VoiceSession } from "@/services/voice";
import { focus } from "@/stores/focus";
import { preferences } from "@/stores/preferences.svelte";

export type CallStatus = "outgoing" | "incoming" | "connecting" | "active";

export type Current = {
  id: string;
  peer: User;
  status: CallStatus;
  startedAt: number | null;
  quiet?: boolean;
  hidden?: boolean;
};

class CallStore {
  current = $state<Current | null>(null);
  waiting = $state<Current | null>(null);
  muted = $state(false);
  deafened = $state(false);
  selfSpeaking = $state(false);
  peerSpeaking = $state(false);
  peerMuted = $state(false);
  peerDeafened = $state(false);
  latency = $state<number | null>(null);
  error = $state("");
  onBeforeAnswer: () => Promise<void> = async () => {};

  #client: Client | null = null;
  #voice: VoiceSession | null = null;
  #ready: Promise<void> = Promise.resolve();
  #iceServers: IceServer[] = [];
  #waitingIce: IceServer[] = [];
  #mutedBeforeDeafen = false;
  #beforeTest: { muted: boolean; deafened: boolean } | null = null;
  #errorTimer: number | undefined;
  #starting = false;

  attach(client: Client) {
    this.#client = client;
    client.onCallIncoming = (call) => this.#incoming(call);
    client.onCallAccepted = (callId) => this.#accepted(callId);
    client.onCallEnded = (callId) => this.#ended(callId);
    client.onCallSignal = (signal) => this.#signal(signal);
    if (client.waitingCall) {
      this.#incoming(client.waitingCall);
      client.waitingCall = null;
    }
  }

  detach() {
    this.waiting = null;
    this.#finish();
    this.#client = null;
  }

  async start(peer: User) {
    const calledBack =
      this.waiting?.peer.id === peer.id || (this.current?.status === "incoming" && this.current.peer.id === peer.id);
    if (calledBack) {
      await this.answer();
      return;
    }
    if (!this.#client || this.#starting || this.current?.peer.id === peer.id) {
      return;
    }
    this.#starting = true;
    let mine: string | null = null;
    try {
      if (this.waiting) {
        await this.decline();
      }
      if (this.current) {
        await this.hangUp();
      }
      const call = await this.#client.startCall(peer.id);
      mine = call.id;
      this.#iceServers = call.iceServers;
      this.current = { id: call.id, peer: call.peer ?? peer, status: "outgoing", startedAt: null };
      this.#syncRing();
      this.#ready = this.#prepare();
      await this.#ready;
    } catch (cause) {
      if (mine && this.current?.id !== mine) {
        return;
      }
      this.#showError(describe(cause, peer.username));
      if (mine) {
        await this.hangUp();
      }
    } finally {
      this.#starting = false;
    }
  }

  async answer() {
    if (this.waiting) {
      await this.hangUp();
    }
    await this.onBeforeAnswer();
    const current = this.current;
    if (!current || current.status !== "incoming" || !this.#client) {
      return;
    }

    playCue("connected");
    current.status = "connecting";
    this.#syncRing();
    try {
      this.#ready = this.#prepare();
      await this.#ready;
      await this.#client.answerCall(current.id);
    } catch (cause) {
      if (this.current?.id !== current.id) {
        return;
      }
      this.#showError(describe(cause, current.peer.username));
      await this.hangUp();
    }
  }

  hide() {
    const target = this.waiting ?? this.current;
    if (target?.status === "incoming") {
      target.hidden = true;
      this.#syncRing();
    }
  }

  async decline() {
    const waiting = this.waiting;
    if (!waiting) {
      await this.hangUp();
      return;
    }
    this.waiting = null;
    this.#syncRing();
    await this.#client?.endCall(waiting.id).catch(() => undefined);
  }

  async hangUp() {
    const current = this.current;
    this.#finish();
    if (current) {
      await this.#client?.endCall(current.id).catch(() => undefined);
    }
  }

  toggleMute() {
    if (this.deafened) {
      this.toggleDeafen();
      return;
    }
    this.muted = !this.muted;
    playCue(this.muted ? "off" : "on");
    this.#voice?.setMuted(this.muted);
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
    this.#voice?.setMuted(this.muted);
    this.#voice?.setDeafened(this.deafened);
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

  #apply(muted: boolean, deafened: boolean) {
    this.muted = muted;
    this.deafened = deafened;
    this.#voice?.setMuted(muted);
    this.#voice?.setDeafened(deafened);
    this.#shareState();
  }

  #shareState() {
    const current = this.current;
    if (!current || current.status !== "active") {
      return;
    }
    const payload = JSON.stringify({ muted: this.muted, deafened: this.deafened });
    this.#client?.sendSignal(current.id, SignalKind.STATE, payload).catch(() => undefined);
  }

  setInputVolume(percent: number) {
    this.#voice?.microphone?.setVolume(percent);
  }

  setSensitivity(percent: number) {
    this.#voice?.microphone?.setSensitivity(percent);
  }

  setNoiseSuppression(percent: number) {
    this.#voice?.microphone?.setSuppression(percent).catch(() => undefined);
  }

  peerVolume(userId: string): number {
    return preferences.values.userVolumes[userId] ?? 100;
  }

  setPeerVolume(userId: string, percent: number) {
    preferences.set("userVolumes", { ...preferences.values.userVolumes, [userId]: percent });
    if (this.current?.peer.id === userId) {
      this.#voice?.setPeerVolume(percent);
    }
  }

  setOutputVolume(percent: number) {
    this.#voice?.setOutputVolume(percent);
  }

  setOutputDevice(deviceId: string) {
    this.#voice?.setOutputDevice(deviceId);
  }

  async #prepare() {
    const current = this.current!;
    const voice = new VoiceSession(this.#iceServers);
    this.#voice = voice;

    voice.onSignal = (kind, payload) => {
      this.#client?.sendSignal(current.id, kind, payload).catch(() => undefined);
    };
    voice.onSpeaking = (self, peer) => {
      this.selfSpeaking = self;
      this.peerSpeaking = peer;
    };
    voice.onConnected = () => {
      if (this.current?.id === current.id) {
        this.current.status = "active";
        this.current.startedAt ??= Date.now();
        this.#shareState();
      }
    };
    voice.onFailed = () => this.hangUp();
    voice.onLatency = (milliseconds) => (this.latency = milliseconds);

    await voice.start(preferences.values.outputDevice, preferences.values.outputVolume);
    voice.setPeerVolume(this.peerVolume(current.peer.id));
    voice.setMuted(this.muted);
  }

  #incoming(call: Call) {
    if (!call.peer || this.waiting) {
      return;
    }
    const quiet = focus.busy;
    const incoming: Current = { id: call.id, peer: call.peer, status: "incoming", startedAt: null, quiet };
    if (this.current) {
      this.#waitingIce = call.iceServers;
      this.waiting = incoming;
    } else {
      this.#iceServers = call.iceServers;
      this.current = incoming;
    }
    this.#syncRing();
    if (!quiet && !windowFocused()) {
      notify("Ludra", t("call.notification", { name: call.peer.username }));
    }
  }

  async #accepted(callId: string) {
    if (this.current?.id !== callId || !this.#voice) {
      return;
    }
    playCue("connected");
    this.current.status = "connecting";
    this.#syncRing();
    try {
      await this.#ready;
      await this.#voice.offer();
    } catch {
      await this.hangUp();
    }
  }

  #ended(callId: string) {
    if (this.waiting?.id === callId) {
      this.waiting = null;
      this.#syncRing();
      return;
    }
    if (this.current?.id === callId) {
      this.#finish();
    }
  }

  async #signal(signal: CallSignal) {
    if (this.current?.id !== signal.callId || !this.#voice) {
      return;
    }
    if (signal.kind === SignalKind.STATE) {
      const state = parseState(signal.payload);
      this.peerMuted = state.muted;
      this.peerDeafened = state.deafened;
      return;
    }
    await this.#voice.receive(signal.kind, signal.payload).catch(() => this.hangUp());
  }

  #finish() {
    this.#beforeTest = null;
    if (this.current) {
      playCue("ended");
    }
    this.#voice?.close();
    this.#voice = null;
    this.current = null;
    this.muted = false;
    this.deafened = false;
    this.selfSpeaking = false;
    this.peerSpeaking = false;
    this.peerMuted = false;
    this.peerDeafened = false;
    this.latency = null;

    const waiting = this.waiting;
    if (waiting) {
      this.waiting = null;
      this.#iceServers = this.#waitingIce;
      this.current = waiting;
    }
    this.#syncRing();
  }

  #syncRing() {
    const current = this.current;
    const ringing = (call: Current | null) => call?.status === "incoming" && !call.quiet && !call.hidden;
    if (current?.status === "outgoing") {
      setRingtone("direct", "outgoing");
    } else if (ringing(current) || ringing(this.waiting)) {
      setRingtone("direct", "incoming");
    } else {
      setRingtone("direct", null);
    }
  }

  #showError(message: string) {
    this.error = message;
    window.clearTimeout(this.#errorTimer);
    this.#errorTimer = window.setTimeout(() => (this.error = ""), 4000);
  }
}

function parseState(payload: string): { muted: boolean; deafened: boolean } {
  try {
    const state = JSON.parse(payload);
    return { muted: state?.muted === true, deafened: state?.deafened === true };
  } catch {
    return { muted: false, deafened: false };
  }
}

function describe(cause: unknown, name: string): string {
  if (cause instanceof DOMException && cause.name === "NotAllowedError") {
    return t("call.microphoneDenied");
  }
  if (cause instanceof DOMException) {
    return t("call.microphoneMissing");
  }
  if (cause instanceof ServerError && cause.code === ErrorCode.UNAVAILABLE) {
    return t("call.busy", { name });
  }
  if (cause instanceof ServerError && cause.code === ErrorCode.TOO_MANY_REQUESTS) {
    return t("common.tooManyRequests");
  }
  return t("call.failed");
}

export const calls = new CallStore();
