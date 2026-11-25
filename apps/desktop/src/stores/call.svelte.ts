import { report, trail } from "@/services/diagnostics";
import { t } from "@/i18n";
import { SignalKind, type Call, type CallSignal, type IceServer, type User } from "@/protocol/ludra/v1/models_pb";
import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
import { ServerError, type Client } from "@/services/client";
import { windowFocused } from "@/services/desktop";
import { playCue, setRingtone } from "@/services/ringtone";
import { cameraCarrier, cameraError, openCamera } from "@/services/camera";
import { callTarget, showToast } from "@/services/toast";
import { VoiceSession } from "@/services/voice";
import { composeScreen } from "@/helpers/screen-stream";
import { StreamReceiver } from "@/services/stream-receiver";
import { StreamSender } from "@/services/stream-sender";
import { closesStream } from "@/services/stream-signal";
import {
  allowedQuality,
  captureScreen,
  needsDirect,
  withinLimits,
  hintScreenTracks,
  qualityLabel,
  type ScreenQuality,
} from "@/services/screen";
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
  caller?: boolean;
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
  shareSettings = $state<{ sourceId: string; quality: ScreenQuality } | null>(null);
  peerSharing = $state<string | null>(null);
  peerLocked = $state(false);
  peerPreview = $state<string | null>(null);
  ownPreview = $state<string | null>(null);
  watching = $state(false);
  peerWatching = $state(false);
  connecting = $state(false);
  screen = $state.raw<MediaStream | null>(null);
  camera = $state.raw<MediaStream | null>(null);
  peerCamera = $state.raw<MediaStream | null>(null);
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
  #peerDirect = false;
  #share: MediaStream | null = null;
  #capture: NativeScreen | null = null;
  #sender: StreamSender | null = null;
  #wantedEncoder = "auto";
  #receiver: StreamReceiver | null = null;
  #shareQuality: ScreenQuality | null = null;
  #shareBusy = false;
  #announcedLock = false;
  #cameraBusy = false;
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

  async start(peer: User, camera = false) {
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
      this.#peerDirect = false;
      const call = await this.#client
        .startCall(peer.id, this.#direct)
        .finally(() => (this.#nextStart = Date.now() + callInterval));
      mine = call.id;
      this.#iceServers = call.iceServers;
      this.current = { id: call.id, peer: call.peer ?? peer, status: "outgoing", startedAt: null, caller: true };
      this.#syncRing();
      this.#ready = this.#prepare();
      if (camera) {
        this.toggleCamera();
      }
      await this.#ready;
    } catch (cause) {
      if (mine && this.current?.id !== mine) {
        return;
      }
      report("error", "call", "could not start the call", cause);
      this.#showError(describe(cause, peer.username));
      if (mine) {
        await this.hangUp();
      }
    } finally {
      this.#starting = false;
    }
  }

  ringing(peer: User): boolean {
    return this.#callsBack(peer);
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
    this.#peerDirect = !!current.direct;
    this.#syncRing();
    try {
      this.#ready = this.#prepare();
      await this.#ready;
      await this.#client.answerCall(current.id, this.#direct);
    } catch (cause) {
      if (this.current?.id !== current.id) {
        return;
      }
      report("error", "call", "could not answer the call", cause);
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

  cycleVoice() {
    if (!this.muted) {
      this.toggleMute();
    } else if (!this.deafened) {
      this.toggleDeafen();
    } else {
      this.#mutedBeforeDeafen = false;
      this.toggleDeafen();
    }
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

  #limitShare(direct: boolean) {
    const share = this.shareSettings;
    if (share && !withinLimits(share.quality, direct)) {
      this.startShare(share.sourceId, share.quality);
    }
  }

  setDirect(enabled: boolean) {
    this.#limitShare(enabled);
    if (this.#direct === enabled) {
      return;
    }
    this.#direct = enabled;
    this.#shareState();
    this.#voice?.setDirect(this.#direct && this.#peerDirect, true);
    this.#enforceLock();
    this.#redirectStream();
  }

  #viewerLocked(): boolean {
    return needsDirect(this.#shareQuality, preferences.values.directCalls) && !(this.#direct && this.#peerDirect);
  }

  async #enforceLock() {
    const locked = this.#viewerLocked();
    const dropped = locked && this.peerWatching;
    if (dropped) {
      this.peerWatching = false;
      this.#sender?.remove(this.current?.peer.id ?? "");
      this.#syncCapture();
    }
    if (locked !== this.#announcedLock) {
      this.#shareState();
    }
    if (dropped) {
      await this.#voice?.setScreen(null, null).catch(() => undefined);
    }
  }

  #redirectStream() {
    const peerId = this.current?.peer.id;
    if (peerId && !this.#shareBusy) {
      this.#sender?.redirect(peerId, this.#iceServers, this.#direct && this.#peerDirect);
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
    this.#announcedLock = this.#viewerLocked();
    const payload = stateMessage({
      locked: this.#announcedLock ? [current.peer.id] : [],
      muted: this.muted,
      deafened: this.deafened,
      sharing,
      direct: this.#direct,
      camera: this.camera ? cameraCarrier.id : "",
    });
    this.#client?.sendSignal(current.id, SignalKind.STATE, payload).catch(() => undefined);
  }

  async toggleCamera() {
    if (this.camera) {
      this.#stopCamera();
      this.#shareState();
      return;
    }
    const call = this.current;
    if (!call || call.status === "incoming" || !this.#voice || this.#cameraBusy) {
      return;
    }
    this.#cameraBusy = true;
    try {
      const stream = await openCamera();
      if (this.current !== call) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const [track] = stream.getVideoTracks();
      track.onended = () => {
        if (this.camera === stream) {
          this.#stopCamera();
          this.#shareState();
        }
      };
      this.camera = stream;
      await this.#voice?.setCamera(track);
      this.#shareState();
    } catch (cause) {
      report("warning", "camera", "the camera did not start", cause);
      this.#showError(cameraError(cause));
    } finally {
      this.#cameraBusy = false;
    }
  }

  #stopCamera() {
    const stream = this.camera;
    if (!stream) {
      return;
    }
    this.camera = null;
    stream.getTracks().forEach((track) => track.stop());
    this.#voice?.setCamera(null).catch(() => undefined);
  }

  async startShare(sourceId: string, requested: ScreenQuality) {
    const quality = allowedQuality(requested, preferences.values.directCalls);
    const call = this.current;
    if (!call || call.status !== "active" || this.#shareBusy) {
      return;
    }
    this.#shareBusy = true;
    try {
      this.#sender ??= this.#createSender(call.id, call.peer.id);
      this.#wantedEncoder = quality.encoder;
      await this.#sender.prepare();
      const capture = await captureScreen(sourceId, quality);
      if (this.current !== call) {
        capture.stop();
        return;
      }
      this.#capture?.stop(false);
      const stream = capture.stream;
      hintScreenTracks(stream, quality);
      if (!this.sharing) {
        playCue("streamStart");
      }
      this.#capture = capture;
      this.#share = stream;
      this.#shareQuality = quality;
      this.shareSettings = { sourceId, quality };
      this.sharing = true;
      trail("screen", `sharing at ${qualityLabel(quality)}, mode ${quality.mode}, encoder ${quality.encoder}`);
      await this.#enforceLock();
      capture.onPreview = (image) => {
        this.ownPreview = image;
        this.#sendPreview(image);
      };
      capture.onEnded = () => {
        if (this.#share === stream) {
          this.stopShare();
        }
      };
      this.#sender?.apply(quality);
      this.#syncCapture();
      if (this.peerWatching) {
        await this.#serve(call.peer.id);
      }
      this.#shareState();
    } catch (cause) {
      report("error", "screen", "screen sharing did not start", cause);
      this.#showError(t("screen.failed"));
    } finally {
      this.#shareBusy = false;
      if (!this.#share) {
        this.#sender?.stop();
        this.#sender = null;
      }
    }
  }

  stopShare(announce = true) {
    const stream = this.#share;
    if (!stream) {
      return;
    }
    this.#share = null;
    this.#shareQuality = null;
    this.shareSettings = null;
    this.sharing = false;
    this.ownPreview = null;
    this.peerWatching = false;
    this.#announcedLock = false;
    this.#sender?.stop();
    this.#sender = null;
    this.#capture?.stop();
    this.#capture = null;
    this.#voice?.setScreen(null, null).catch(() => undefined);
    if (announce) {
      playCue("streamEnd");
      this.#shareState();
    }
  }

  #createSender(callId: string, peerId: string): StreamSender {
    const sender = new StreamSender();
    sender.onBroken = () => this.#encoderFailed();
    sender.onSignal = (_, kind, payload) => this.#send(callId, peerId, kind, payload);
    sender.onFallback = () => {
      if (this.#viewerLocked()) {
        return;
      }
      this.#voice?.setScreen(this.#share, this.#shareQuality).catch(() => undefined);
      this.#syncCapture();
    };
    return sender;
  }

  #encoderFailed() {
    if (this.#wantedEncoder !== "auto" && this.#wantedEncoder !== "compatibility") {
      this.#showError(t("screen.encoderFailed"));
    }
  }

  async #serve(peerId: string) {
    const share = this.#share;
    const sender = this.#sender;
    if (!share || !sender || this.#viewerLocked()) {
      return;
    }
    const direct = this.#direct && this.#peerDirect;
    const native = sender.has(peerId) || (await sender.add(peerId, this.#iceServers, direct));
    if (this.#share !== share || !this.peerWatching) {
      return;
    }
    await this.#voice?.setScreen(share, this.#shareQuality, !native).catch(() => undefined);
    this.#syncCapture();
  }

  #syncCapture() {
    const peerId = this.current?.peer.id ?? "";
    this.#capture?.setWatched(this.peerWatching && !this.#sender?.has(peerId));
  }

  #send(callId: string, peerId: string, kind: SignalKind, payload: string) {
    this.#signalsOut = this.#signalsOut
      .then(async () => {
        const sealed = await trust.seal(callId, peerId, kind, payload);
        await this.#client?.sendSignal(callId, kind, sealed);
      })
      .catch(() => undefined);
  }

  #refreshScreen() {
    const native = this.#receiver?.stream ?? null;
    this.screen = this.watching
      ? composeScreen(native, this.#voice?.screen ?? null, this.#voice?.screenAudio ?? null)
      : null;
  }

  #closeReceiver() {
    this.#receiver?.close();
    this.#receiver = null;
  }

  async #streamSignal(callId: string, peerId: string, kind: SignalKind, payload: string) {
    if (kind === SignalKind.STREAM_ANSWER) {
      await this.#sender?.answer(peerId, payload);
      return;
    }
    this.#closeReceiver();
    if (closesStream(payload) || !this.watching) {
      this.#refreshScreen();
      return;
    }
    const receiver = new StreamReceiver(this.#iceServers, this.#direct && this.#peerDirect);
    this.#receiver = receiver;
    receiver.onStream = () => this.#refreshScreen();
    receiver.onFailed = () => {
      this.#closeReceiver();
      this.#refreshScreen();
    };
    const answer = await receiver.answer(payload);
    if (this.#receiver === receiver) {
      this.#send(callId, peerId, SignalKind.STREAM_ANSWER, answer);
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
    if (this.peerLocked) {
      this.#showError(t("screen.locked", { name: current.peer.username }));
      return;
    }
    this.watching = true;
    this.#refreshScreen();
    this.#client?.sendSignal(current.id, SignalKind.STATE, watchMessage(true)).catch(() => undefined);
  }

  unwatch() {
    const current = this.current;
    if (!this.watching) {
      return;
    }
    this.watching = false;
    this.#closeReceiver();
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
    const voice = new VoiceSession(this.#iceServers, answering, answering && this.#direct && this.#peerDirect);
    this.#voice = voice;

    voice.onSignal = (kind, payload) => this.#send(current.id, current.peer.id, kind, payload);
    voice.onSpeaking = (self, peer) => {
      this.selfSpeaking = self;
      this.peerSpeaking = peer;
    };
    voice.onConnected = () => {
      if (this.current?.id === current.id) {
        trail("call", "direct call connected");
        this.current.status = "active";
        this.current.startedAt ??= Date.now();
        this.#shareState();
      }
    };
    voice.onFailed = () => this.hangUp();
    voice.onStatus = (connecting) => (this.connecting = connecting);
    this.connecting = true;
    voice.onLatency = (milliseconds) => (this.latency = milliseconds);
    voice.onScreen = () => this.#refreshScreen();
    voice.onCamera = (stream) => (this.peerCamera = stream);

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
      showToast({
        title: call.peer.username,
        body: t("call.notification", { name: call.peer.username }),
        kind: "user",
        id: call.peer.id,
        name: call.peer.username,
        avatar: call.peer.avatar,
        target: callTarget,
      });
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
      this.#peerDirect = direct;
      this.#voice.setDirect(this.#direct && direct, false);
      await this.#voice.offer();
    } catch (cause) {
      report("error", "call", "could not offer the call", cause);
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
        this.peerWatching = message.watching && !!this.#share && !this.#viewerLocked();
        if (message.watching && this.#viewerLocked()) {
          this.#shareState();
        } else if (this.peerWatching) {
          await this.#serve(this.current.peer.id);
        } else if (this.#share) {
          this.#sender?.remove(this.current.peer.id);
          this.#syncCapture();
          await this.#voice.setScreen(null, null).catch(() => undefined);
        }
        return;
      }
      if (message.kind === "preview") {
        this.peerPreview = this.peerSharing && message.image ? message.image : null;
        return;
      }
      if (message.direct !== undefined && message.direct !== this.#peerDirect) {
        this.#peerDirect = message.direct;
        this.#voice.setDirect(this.#direct && this.#peerDirect, false);
        this.#enforceLock();
        this.#redirectStream();
      }
      if (!!message.sharing !== !!this.peerSharing) {
        playCue(message.sharing ? "streamStart" : "streamEnd");
      }
      this.#voice.setRemoteCamera(message.camera ?? "");
      this.peerMuted = message.muted;
      this.peerDeafened = message.deafened;
      this.peerSharing = message.sharing;
      if (!message.sharing) {
        this.peerPreview = null;
      }
      if (!message.sharing) {
        this.#closeReceiver();
      }
      if (!message.sharing && this.watching) {
        this.watching = false;
        this.screen = null;
      }
      this.peerLocked = !!message.sharing && !!message.locked?.length;
      if (this.peerLocked && this.watching) {
        this.#showError(t("screen.locked", { name: this.current.peer.username }));
        this.#closeReceiver();
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
      } catch (cause) {
        report("error", "call", "could not verify a call signature", cause);
        this.#showError(t("call.insecure"));
        await this.hangUp();
        return;
      }
      if (signal.kind === SignalKind.STREAM_OFFER || signal.kind === SignalKind.STREAM_ANSWER) {
        this.#streamSignal(signal.callId, peerId, signal.kind, payload).catch((cause) => {
          report("error", "stream", "could not handle a stream signal", cause);
          this.#closeReceiver();
        });
        return;
      }
      await voice.receive(signal.kind, payload).catch((cause) => {
        report("error", "call", "could not handle a call signal", cause);
        return this.hangUp();
      });
    });
  }

  #finish() {
    this.#beforeTest = null;
    this.stopShare(false);
    this.#stopCamera();
    this.peerCamera = null;
    this.peerWatching = false;
    this.peerSharing = null;
    this.peerLocked = false;
    this.peerPreview = null;
    this.#closeReceiver();
    this.watching = false;
    this.screen = null;
    if (this.current) {
      trail("call", "direct call ended");
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
    this.connecting = false;
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
