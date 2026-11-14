import { t } from "@/i18n";
import { SignalKind, type Call, type CallSignal, type IceServer, type User } from "@/protocol/ludra/v1/models_pb";
import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
import { ServerError, type Client } from "@/services/client";
import { notify, windowFocused } from "@/services/desktop";
import { playCue, startRingtone, stopRingtone } from "@/services/ringtone";
import { VoiceSession } from "@/services/voice";
import { preferences } from "@/stores/preferences.svelte";

export type CallStatus = "outgoing" | "incoming" | "connecting" | "active";

export type Current = {
  id: string;
  peer: User;
  status: CallStatus;
  startedAt: number | null;
};

class CallStore {
  current = $state<Current | null>(null);
  muted = $state(false);
  deafened = $state(false);
  selfSpeaking = $state(false);
  peerSpeaking = $state(false);
  peerMuted = $state(false);
  peerDeafened = $state(false);
  latency = $state<number | null>(null);
  error = $state("");

  #client: Client | null = null;
  #voice: VoiceSession | null = null;
  #ready: Promise<void> = Promise.resolve();
  #iceServers: IceServer[] = [];
  #mutedBeforeDeafen = false;
  #beforeTest: { muted: boolean; deafened: boolean } | null = null;
  #errorTimer: number | undefined;

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
    this.#finish();
    this.#client = null;
  }

  async start(peer: User) {
    if (!this.#client || this.current) {
      return;
    }

    try {
      const call = await this.#client.startCall(peer.id);
      this.#iceServers = call.iceServers;
      this.current = { id: call.id, peer: call.peer ?? peer, status: "outgoing", startedAt: null };
      startRingtone("outgoing");
      this.#ready = this.#prepare();
      await this.#ready;
    } catch (cause) {
      this.#showError(describe(cause, peer.username));
      if (this.current) {
        await this.hangUp();
      }
    }
  }

  async answer() {
    const current = this.current;
    if (!current || current.status !== "incoming" || !this.#client) {
      return;
    }

    stopRingtone();
    playCue("connected");
    current.status = "connecting";
    try {
      this.#ready = this.#prepare();
      await this.#ready;
      await this.#client.answerCall(current.id);
    } catch (cause) {
      this.#showError(describe(cause, current.peer.username));
      await this.hangUp();
    }
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
    if (this.current || !call.peer) {
      return;
    }

    this.#iceServers = call.iceServers;
    this.current = { id: call.id, peer: call.peer, status: "incoming", startedAt: null };
    startRingtone("incoming");
    if (!windowFocused()) {
      notify("Ludra", t("call.notification", { name: call.peer.username }));
    }
  }

  async #accepted(callId: string) {
    if (this.current?.id !== callId || !this.#voice) {
      return;
    }
    stopRingtone();
    playCue("connected");
    this.current.status = "connecting";
    try {
      await this.#ready;
      await this.#voice.offer();
    } catch {
      await this.hangUp();
    }
  }

  #ended(callId: string) {
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
    stopRingtone();
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
