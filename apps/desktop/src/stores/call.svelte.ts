import { t } from "@/i18n";
import { SignalKind, type Call, type CallSignal, type IceServer, type User } from "@/protocol/ludra/v1/models_pb";
import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
import { ServerError, type Client } from "@/services/client";
import { notify, windowFocused } from "@/services/desktop";
import { playCue, setRingtone } from "@/services/ringtone";
import { VoiceSession } from "@/services/voice";
import { captureScreen, hintScreenTracks, qualityLabel, type ScreenQuality } from "@/services/screen";
import type { NativeScreen } from "@/services/native-screen";
import { parseVoiceMessage, previewMessage, stateMessage, watchMessage } from "@/helpers/voice-state";
import { focus } from "@/stores/focus";
import { preferences } from "@/stores/preferences.svelte";
import { trust } from "@/stores/trust.svelte";

export type CallStatus = "outgoing" | "incoming" | "connecting" | "active";

const callInterval = 5000;

export type Current = {
  id: string;
  peer: User;
  status: CallStatus;
  startedAt: number | null;
  quiet?: boolean;
  direct?: boolean;
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
  sharing = $state(false);
  peerSharing = $state<string | null>(null);
  peerPreview = $state<string | null>(null);
  ownPreview = $state<string | null>(null);
  watching = $state(false);
  screen = $state.raw<MediaStream | null>(null);
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
  #nextStart = 0;
  #direct = false;
  #share: MediaStream | null = null;
  #capture: NativeScreen | null = null;
  #shareQuality: ScreenQuality | null = null;
  #peerWatching = false;
  #shareBusy = false;
  #signalsOut: Promise<void> = Promise.resolve();
  #signalsIn: Promise<void> = Promise.resolve();

  attach(client: Client) {
    this.#client = client;
    client.onCallIncoming = (call) => this.#incoming(call);
    client.onCallAccepted = (callId, direct) => this.#accepted(callId, direct);
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

  coolingDown(peer: User): boolean {
    const wait = this.#nextStart - Date.now();
    if (wait <= 0 || this.#callsBack(peer)) {
      return false;
    }
    this.#showError(t("call.cooldown", { seconds: Math.ceil(wait / 1000) }));
    return true;
  }

  async start(peer: User) {
    if (this.#callsBack(peer)) {
      await this.answer();
      return;
    }
    if (!this.#client || this.#starting || this.current?.peer.id === peer.id || this.coolingDown(peer)) {
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
      this.#direct = preferences.values.directCalls;
      const call = await this.#client
        .startCall(peer.id, this.#direct)
        .finally(() => (this.#nextStart = Date.now() + callInterval));
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

  #callsBack(peer: User): boolean {
    return (
      this.waiting?.peer.id === peer.id || (this.current?.status === "incoming" && this.current.peer.id === peer.id)
    );
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
    this.#direct = preferences.values.directCalls;
    this.#syncRing();
    try {
      this.#ready = this.#prepare();
      await this.#ready;
      await this.#client.answerCall(current.id, this.#direct);
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
    const sharing = this.#shareQuality ? qualityLabel(this.#shareQuality) : null;
    const payload = stateMessage({ muted: this.muted, deafened: this.deafened, sharing });
    this.#client?.sendSignal(current.id, SignalKind.STATE, payload).catch(() => undefined);
  }

  async startShare(sourceId: string, quality: ScreenQuality) {
    const call = this.current;
    if (!call || call.status !== "active" || this.#shareBusy) {
      return;
    }
    this.#shareBusy = true;
    try {
      const capture = await captureScreen(sourceId, quality);
      if (this.current !== call) {
        capture.stop();
        return;
      }
      this.#capture?.stop(false);
      const stream = capture.stream;
      hintScreenTracks(stream);
      this.#capture = capture;
      this.#share = stream;
      this.#shareQuality = quality;
      this.sharing = true;
      capture.onPreview = (image) => {
        this.ownPreview = image;
        this.#sendPreview(image);
      };
      capture.onEnded = () => {
        if (this.#share === stream) {
          this.stopShare();
        }
      };
      capture.setWatched(this.#peerWatching);
      if (this.#peerWatching) {
        await this.#voice?.setScreen(stream, quality);
      }
      this.#shareState();
    } catch {
      this.#showError(t("screen.failed"));
    } finally {
      this.#shareBusy = false;
    }
  }

  stopShare(announce = true) {
    const stream = this.#share;
    if (!stream) {
      return;
    }
    this.#share = null;
    this.#shareQuality = null;
    this.sharing = false;
    this.ownPreview = null;
    this.#peerWatching = false;
    this.#capture?.stop();
    this.#capture = null;
    this.#voice?.setScreen(null, null).catch(() => undefined);
    if (announce) {
      this.#shareState();
    }
  }

  #sendPreview(image: string) {
    const current = this.current;
    if (current && this.sharing) {
      this.#client?.sendSignal(current.id, SignalKind.STATE, previewMessage(image)).catch(() => undefined);
    }
  }

  watch() {
    const current = this.current;
    if (!current || !this.peerSharing || this.watching) {
      return;
    }
    this.watching = true;
    this.screen = this.#voice?.screen ?? null;
    this.#client?.sendSignal(current.id, SignalKind.STATE, watchMessage(true)).catch(() => undefined);
  }

  unwatch() {
    const current = this.current;
    if (!this.watching) {
      return;
    }
    this.watching = false;
    this.screen = null;
    if (current) {
      this.#client?.sendSignal(current.id, SignalKind.STATE, watchMessage(false)).catch(() => undefined);
    }
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
    const answering = current.status !== "outgoing";
    const voice = new VoiceSession(this.#iceServers, answering, answering && this.#direct && !!current.direct);
    this.#voice = voice;

    voice.onSignal = (kind, payload) => {
      this.#signalsOut = this.#signalsOut
        .then(async () => {
          const sealed = await trust.seal(current.id, current.peer.id, kind, payload);
          await this.#client?.sendSignal(current.id, kind, sealed);
        })
        .catch(() => undefined);
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
    voice.onScreen = (stream) => (this.screen = this.watching ? stream : null);

    await trust.prepare([current.peer.id]);
    await voice.start(preferences.values.outputDevice, preferences.values.outputVolume);
    voice.setPeerVolume(this.peerVolume(current.peer.id));
    voice.setMuted(this.muted);
  }

  #incoming(call: Call) {
    if (!call.peer || this.waiting) {
      return;
    }
    const quiet = focus.busy;
    const incoming: Current = {
      id: call.id,
      peer: call.peer,
      status: "incoming",
      startedAt: null,
      quiet,
      direct: call.direct,
    };
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

  async #accepted(callId: string, direct: boolean) {
    if (this.current?.id !== callId || !this.#voice) {
      return;
    }
    playCue("connected");
    this.current.status = "connecting";
    this.#syncRing();
    try {
      await this.#ready;
      if (direct && this.#direct) {
        this.#voice.allowDirect();
      }
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
      const message = parseVoiceMessage(signal.payload);
      if (message.kind === "watch") {
        this.#peerWatching = message.watching && !!this.#share;
        this.#capture?.setWatched(this.#peerWatching);
        if (this.#share) {
          await this.#voice.setScreen(message.watching ? this.#share : null, this.#shareQuality).catch(() => undefined);
        }
        return;
      }
      if (message.kind === "preview") {
        this.peerPreview = this.peerSharing && message.image ? message.image : null;
        return;
      }
      this.peerMuted = message.muted;
      this.peerDeafened = message.deafened;
      this.peerSharing = message.sharing;
      if (!message.sharing) {
        this.peerPreview = null;
      }
      if (!message.sharing && this.watching) {
        this.watching = false;
        this.screen = null;
      }
      return;
    }
    const voice = this.#voice;
    const peerId = this.current.peer.id;
    this.#signalsIn = this.#signalsIn.then(async () => {
      let payload: string;
      try {
        payload = await trust.open(signal.callId, peerId, signal.kind, signal.payload);
      } catch {
        this.#showError(t("call.insecure"));
        await this.hangUp();
        return;
      }
      await voice.receive(signal.kind, payload).catch(() => this.hangUp());
    });
  }

  #finish() {
    this.#beforeTest = null;
    this.stopShare(false);
    this.#peerWatching = false;
    this.peerSharing = null;
    this.peerPreview = null;
    this.watching = false;
    this.screen = null;
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
