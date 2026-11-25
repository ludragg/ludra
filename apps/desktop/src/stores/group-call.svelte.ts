import { report, trail } from "@/services/diagnostics";
import { t } from "@/i18n";
import { SignalKind, type CallSignal, type GroupCall, type IceServer, type User } from "@/protocol/ludra/v1/models_pb";
import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
import { ServerError, type Client } from "@/services/client";
import { windowFocused } from "@/services/desktop";
import { cameraCarrier, cameraError, openCamera } from "@/services/camera";
import { showToast } from "@/services/toast";
import { playCue, setRingtone } from "@/services/ringtone";
import { VoiceRoom } from "@/services/voice-room";
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
import {
  parseVoiceMessage,
  previewMessage,
  stateMessage,
  validPreview,
  watchMessage,
  type VoiceState,
} from "@/helpers/voice-state";
import { calls } from "@/stores/call.svelte";
import { focus } from "@/stores/focus";
import { preferences } from "@/stores/preferences.svelte";
import { trust } from "@/stores/trust.svelte";

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

export type VoiceSnapshot = {
  conversationId: string;
  muted: boolean;
  deafened: boolean;
  mutedBeforeDeafen: boolean;
};

const ringTimeout = 30_000;

class GroupCallStore {
  current = $state<GroupCurrent | null>(null);
  ringing = $state<Ringing | null>(null);
  joining = $state(false);
  muted = $state(false);
  deafened = $state(false);
  speaking = $state<Set<string>>(new Set());
  states = $state<Record<string, VoiceState>>({});
  sharing = $state(false);
  shareSettings = $state<{ sourceId: string; quality: ScreenQuality } | null>(null);
  watchingId = $state<string | null>(null);
  previews = $state<Record<string, string>>({});
  outsidePreviews = $state<Record<string, Record<string, string>>>({});
  ownPreview = $state<string | null>(null);
  viewers = $state<string[]>([]);
  connecting = $state(false);
  screen = $state.raw<MediaStream | null>(null);
  camera = $state.raw<MediaStream | null>(null);
  cameras = $state.raw<Record<string, MediaStream>>({});
  latency = $state<number | null>(null);
  latencies = $state.raw<Record<string, number>>({});
  error = $state("");
  friendly: (userId: string) => boolean = () => false;
  nameOf: (userId: string) => string = () => "";

  #client: Client | null = null;
  #room: VoiceRoom | null = null;
  #direct = false;
  #peerDirect = new Map<string, boolean>();
  #started: Promise<void> = Promise.resolve();
  #mutedBeforeDeafen = false;
  #beforeTest: { muted: boolean; deafened: boolean } | null = null;
  #ringTimer: number | undefined;
  #calling = false;
  #share: MediaStream | null = null;
  #capture: NativeScreen | null = null;
  #sender: StreamSender | null = null;
  #wantedEncoder = "auto";
  #receiver: StreamReceiver | null = null;
  #receiverPeer = "";
  #iceServers: IceServer[] = [];
  #shareQuality: ScreenQuality | null = null;
  #viewers = new Set<string>();
  #preview: string | null = null;
  #pendingWatch: string | null = null;
  #linked = new Set<string>();
  #shareBusy = false;
  #announcedLocks = "";
  #cameraBusy = false;
  #outgoing = new Map<string, Promise<void>>();
  #incoming = new Map<string, Promise<void>>();
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
    client.onStreamPreview = (conversationId, userId, image) => this.#outsidePreview(conversationId, userId, image);
  }

  detach() {
    this.#dismiss();
    this.#finish();
    this.#latest.clear();
    this.outsidePreviews = {};
    this.#client = null;
  }

  snapshot(): VoiceSnapshot | null {
    if (!this.current) {
      return null;
    }
    return {
      conversationId: this.current.conversationId,
      muted: this.muted,
      deafened: this.deafened,
      mutedBeforeDeafen: this.#mutedBeforeDeafen,
    };
  }

  async restore(snapshot: VoiceSnapshot, selfId: string) {
    this.muted = snapshot.muted;
    this.deafened = snapshot.deafened;
    this.#mutedBeforeDeafen = snapshot.mutedBeforeDeafen;
    await this.join(snapshot.conversationId, selfId);
  }

  async joinWatching(conversationId: string, selfId: string, peerId: string) {
    if (this.current?.conversationId === conversationId) {
      this.watch(peerId);
      return;
    }
    if (!this.#client || this.joining) {
      return;
    }
    this.#pendingWatch = peerId;
    await this.join(conversationId, selfId);
    if (!this.current) {
      this.#pendingWatch = null;
    }
  }

  async join(conversationId: string, selfId: string, camera = false) {
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
      this.#direct = preferences.values.directCalls;
      const joined = await this.#client.joinGroupCall(conversationId, this.#direct);
      await trust.prepare(joined.participantIds);
      this.#iceServers = joined.iceServers;
      room = new VoiceRoom(joined.iceServers, selfId);
      room.directWith = (peerId) =>
        this.#direct &&
        this.friendly(peerId) &&
        (this.#peerDirect.get(peerId) ?? !!this.#latest.get(conversationId)?.directIds.includes(peerId));
      this.#room = room;
      this.current = {
        id: joined.callId,
        conversationId,
        selfId,
        participantIds: [selfId, ...joined.participantIds],
        startedAt: Date.now(),
      };
      this.#wire(room);
      trail("call", `joined a group call with ${joined.participantIds.length} other people`);
      this.#started = room.start();
      await this.#started;
      room.setMuted(this.muted);
      room.setDeafened(this.deafened);
      if (camera) {
        await this.toggleCamera();
      }
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
      report("error", "call", "could not join the group call", cause);
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
      showToast({
        title: starter.username,
        body: t("group.ringNotification", { name: starter.username }),
        kind: "user",
        id: starter.id,
        name: starter.username,
        avatar: starter.avatar,
        target: conversationId,
      });
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
    this.#pruneOutside(conversationId, call?.sharingIds ?? []);
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
      this.#forget(peerId);
    }
    current.participantIds = call.participantIds;
  }

  conversationGone(conversationId: string) {
    delete this.outsidePreviews[conversationId];
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
    const room = this.#room;
    if (!this.current || !room) {
      return;
    }
    this.#shareState();
    for (const peerId of room.peers()) {
      room.refreshDirect(peerId, this.#peerDirect.has(peerId));
    }
    this.#enforceLocks();
    for (const peerId of room.peers()) {
      this.#redirectStream(peerId);
    }
  }

  lockedBy(peerId: string): boolean {
    return !!this.current && !!this.states[peerId]?.locked?.includes(this.current.selfId);
  }

  #redirectStream(peerId: string) {
    if (this.#room && !this.#shareBusy) {
      this.#sender?.redirect(peerId, this.#iceServers, this.#room.directWith(peerId));
    }
  }

  #viewerLocked(peerId: string): boolean {
    const room = this.#room;
    return !!room && needsDirect(this.#shareQuality, preferences.values.directCalls) && !room.directWith(peerId);
  }

  #lockedViewers(): string[] {
    const current = this.current;
    return current ? current.participantIds.filter((id) => id !== current.selfId && this.#viewerLocked(id)) : [];
  }

  async #enforceLocks() {
    const dropped = [...this.#viewers].filter((viewer) => this.#viewerLocked(viewer));
    for (const viewer of dropped) {
      this.#viewers.delete(viewer);
      this.#sender?.remove(viewer);
    }
    if (dropped.length) {
      this.#syncCapture();
      this.#viewersChanged();
    } else if (this.#lockedViewers().join() !== this.#announcedLocks) {
      this.#shareState();
    }
    await Promise.all(dropped.map((viewer) => this.#room?.setScreen(viewer, null, null).catch(() => undefined)));
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
    room.onSignal = (peerId, kind, payload) => this.#send(peerId, kind, payload);
    room.onSpeaking = (speaking) => (this.speaking = speaking);
    room.onConnecting = (connecting) => (this.connecting = connecting);
    room.onLatency = (milliseconds) => (this.latency = room.peers().length ? milliseconds : null);
    room.onPeerLatency = (peerId, milliseconds) => {
      const next = { ...this.latencies };
      if (milliseconds === null) {
        delete next[peerId];
      } else {
        next[peerId] = milliseconds;
      }
      this.latencies = next;
    };
    room.onPeerConnected = (peerId) => {
      this.#linked.add(peerId);
      this.#shareState();
      this.#sendPreview();
      this.#watchPending(peerId);
    };
    room.onPeerFailed = (peerId) => {
      room.remove(peerId);
      this.#forget(peerId);
    };
    room.onCamera = (peerId, stream) => {
      const next = { ...this.cameras };
      delete next[peerId];
      if (stream) {
        next[peerId] = stream;
      }
      this.cameras = next;
    };
    room.onScreen = (peerId) => this.#refreshScreen(peerId);
  }

  async #signal(signal: CallSignal) {
    const room = this.#room;
    if (!room || !signal.peerId) {
      return;
    }
    if (signal.kind === SignalKind.STATE) {
      const message = parseVoiceMessage(signal.payload);
      if (message.kind === "watch") {
        await this.#setViewer(signal.peerId, message.watching);
        return;
      }
      if (message.kind === "preview") {
        if (this.states[signal.peerId]?.sharing && message.image) {
          this.previews[signal.peerId] = message.image;
        }
        return;
      }
      const previous = this.states[signal.peerId];
      if (previous && !!previous.sharing !== !!message.sharing) {
        playCue(message.sharing ? "streamStart" : "streamEnd");
      }
      if (message.direct !== undefined && message.direct !== this.#peerDirect.get(signal.peerId)) {
        this.#peerDirect.set(signal.peerId, message.direct);
        room.refreshDirect(signal.peerId, false);
        this.#enforceLocks();
        this.#redirectStream(signal.peerId);
      }
      room.setRemoteCamera(signal.peerId, message.camera ?? "");
      this.states[signal.peerId] = {
        muted: message.muted,
        deafened: message.deafened,
        sharing: message.sharing,
        viewers: message.viewers,
        camera: message.camera,
        locked: message.locked,
      };
      if (!message.sharing) {
        delete this.previews[signal.peerId];
      }
      if (!message.sharing && this.#receiverPeer === signal.peerId) {
        this.#closeReceiver();
      }
      if (!message.sharing && this.watchingId === signal.peerId) {
        this.watchingId = null;
        this.screen = null;
      }
      if (message.sharing && this.watchingId === signal.peerId && this.lockedBy(signal.peerId)) {
        this.#showLocked(signal.peerId);
        this.#closeReceiver();
        this.watchingId = null;
        this.screen = null;
      }
      this.#watchPending(signal.peerId);
      return;
    }
    const peerId = signal.peerId;
    const previous = this.#incoming.get(peerId) ?? Promise.resolve();
    const next = previous.then(async () => {
      await this.#started.catch(() => undefined);
      let payload: string;
      try {
        payload = await trust.open(signal.callId, peerId, signal.kind, signal.payload);
      } catch (cause) {
        report("error", "call", "could not verify a call signature", cause);
        this.#showError(t("call.insecure"));
        room.remove(peerId);
        this.#forget(peerId);
        return;
      }
      if (signal.kind === SignalKind.STREAM_OFFER || signal.kind === SignalKind.STREAM_ANSWER) {
        this.#streamSignal(peerId, signal.kind, payload).catch((cause) => {
          report("error", "stream", "could not handle a stream signal", cause);
          this.#closeReceiver();
        });
        return;
      }
      await room.receive(peerId, signal.kind, payload).catch((cause) => {
        report("error", "call", "could not handle a group call signal", cause);
        room.remove(peerId);
      });
    });
    this.#incoming.set(peerId, next);
    await next;
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
    const sharing = this.#shareQuality ? qualityLabel(this.#shareQuality) : null;
    const viewers = this.#share ? [...this.#viewers] : undefined;
    const locked = this.#share ? this.#lockedViewers() : undefined;
    this.#announcedLocks = locked?.join() ?? "";
    const payload = stateMessage({
      locked,
      muted: this.muted,
      deafened: this.deafened,
      sharing,
      direct: this.#direct,
      viewers,
      camera: this.camera ? cameraCarrier.id : "",
    });
    this.#client?.sendSignal(current.id, SignalKind.STATE, payload, "*").catch(() => undefined);
  }

  async toggleCamera() {
    if (this.camera) {
      this.#stopCamera();
      this.#shareState();
      return;
    }
    const room = this.#room;
    if (!this.current || !room || this.#cameraBusy) {
      return;
    }
    this.#cameraBusy = true;
    try {
      const stream = await openCamera();
      if (this.#room !== room) {
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
      await room.setCamera(track);
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
    this.#room?.setCamera(null).catch(() => undefined);
  }

  async startShare(sourceId: string, requested: ScreenQuality) {
    const quality = allowedQuality(requested, preferences.values.directCalls);
    const room = this.#room;
    if (!this.current || !room || this.#shareBusy) {
      return;
    }
    this.#shareBusy = true;
    try {
      this.#sender ??= this.#createSender();
      this.#wantedEncoder = quality.encoder;
      await this.#sender.prepare();
      const capture = await captureScreen(sourceId, quality);
      if (this.#room !== room) {
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
      await this.#enforceLocks();
      capture.onPreview = (image) => {
        this.#preview = image;
        this.ownPreview = image;
        this.#sendPreview();
      };
      capture.onEnded = () => {
        if (this.#share === stream) {
          this.stopShare();
        }
      };
      this.#sender?.apply(quality);
      this.#syncCapture();
      await Promise.all([...this.#viewers].map((viewer) => this.#serve(viewer)));
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
    this.#preview = null;
    this.ownPreview = null;
    this.#sender?.stop();
    this.#sender = null;
    this.#capture?.stop();
    this.#capture = null;
    for (const viewer of this.#viewers) {
      this.#room?.setScreen(viewer, null, null).catch(() => undefined);
    }
    this.#viewers.clear();
    this.#announcedLocks = "";
    this.viewers = [];
    if (announce) {
      playCue("streamEnd");
      this.#shareState();
    }
  }

  watch(peerId: string) {
    const current = this.current;
    if (!current || !this.states[peerId]?.sharing || this.watchingId === peerId) {
      return;
    }
    this.#pendingWatch = null;
    if (this.lockedBy(peerId)) {
      this.#showLocked(peerId);
      return;
    }
    this.unwatch();
    this.watchingId = peerId;
    this.#refreshScreen(peerId);
    this.#client?.sendSignal(current.id, SignalKind.STATE, watchMessage(true), peerId).catch(() => undefined);
  }

  unwatch() {
    const current = this.current;
    const peerId = this.watchingId;
    if (!peerId) {
      return;
    }
    this.watchingId = null;
    this.#closeReceiver();
    this.screen = null;
    if (current) {
      this.#client?.sendSignal(current.id, SignalKind.STATE, watchMessage(false), peerId).catch(() => undefined);
    }
  }

  async #setViewer(peerId: string, watching: boolean) {
    if (watching && this.#share && this.#viewerLocked(peerId)) {
      this.#shareState();
    } else if (watching && this.#share) {
      this.#viewers.add(peerId);
      this.#viewersChanged();
      await this.#serve(peerId);
    } else if (this.#viewers.delete(peerId)) {
      this.#sender?.remove(peerId);
      this.#syncCapture();
      this.#viewersChanged();
      await this.#room?.setScreen(peerId, null, null).catch(() => undefined);
    }
  }

  #createSender(): StreamSender {
    const sender = new StreamSender();
    sender.onBroken = () => this.#encoderFailed();
    sender.onSignal = (peerId, kind, payload) => this.#send(peerId, kind, payload);
    sender.onFallback = (peerId) => {
      if (this.#viewerLocked(peerId)) {
        return;
      }
      this.#room?.setScreen(peerId, this.#share, this.#shareQuality).catch(() => undefined);
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
    const room = this.#room;
    const share = this.#share;
    const sender = this.#sender;
    if (!room || !share || !sender || this.#viewerLocked(peerId)) {
      return;
    }
    const native = sender.has(peerId) || (await sender.add(peerId, this.#iceServers, room.directWith(peerId)));
    if (this.#share !== share || !this.#viewers.has(peerId)) {
      return;
    }
    await room.setScreen(peerId, share, this.#shareQuality, !native).catch(() => undefined);
    this.#syncCapture();
  }

  #syncCapture() {
    this.#capture?.setWatched([...this.#viewers].some((viewer) => !this.#sender?.has(viewer)));
  }

  #send(peerId: string, kind: SignalKind, payload: string) {
    const current = this.current;
    if (!current) {
      return;
    }
    const previous = this.#outgoing.get(peerId) ?? Promise.resolve();
    this.#outgoing.set(
      peerId,
      previous
        .then(async () => {
          const sealed = await trust.seal(current.id, peerId, kind, payload);
          await this.#client?.sendSignal(current.id, kind, sealed, peerId);
        })
        .catch(() => undefined),
    );
  }

  #refreshScreen(peerId: string) {
    const room = this.#room;
    if (this.watchingId !== peerId || !room) {
      return;
    }
    const native = this.#receiverPeer === peerId ? (this.#receiver?.stream ?? null) : null;
    this.screen = composeScreen(native, room.screen(peerId), room.screenAudio(peerId));
  }

  #closeReceiver() {
    this.#receiver?.close();
    this.#receiver = null;
    this.#receiverPeer = "";
  }

  async #streamSignal(peerId: string, kind: SignalKind, payload: string) {
    const room = this.#room;
    if (kind === SignalKind.STREAM_ANSWER) {
      await this.#sender?.answer(peerId, payload);
      return;
    }
    if (!room || this.watchingId !== peerId || closesStream(payload)) {
      if (this.#receiverPeer === peerId) {
        this.#closeReceiver();
        this.#refreshScreen(peerId);
      }
      return;
    }
    this.#closeReceiver();
    const receiver = new StreamReceiver(this.#iceServers, room.directWith(peerId));
    this.#receiver = receiver;
    this.#receiverPeer = peerId;
    receiver.onStream = () => this.#refreshScreen(peerId);
    receiver.onFailed = () => {
      this.#closeReceiver();
      this.#refreshScreen(peerId);
    };
    const answer = await receiver.answer(payload);
    if (this.#receiver === receiver) {
      this.#send(peerId, SignalKind.STREAM_ANSWER, answer);
    }
  }

  #viewersChanged() {
    this.viewers = [...this.#viewers];
    this.#shareState();
  }

  #sendPreview() {
    const current = this.current;
    if (current && this.sharing && this.#preview) {
      this.#client?.sendSignal(current.id, SignalKind.STATE, previewMessage(this.#preview), "*").catch(() => undefined);
    }
  }

  #watchPending(peerId: string) {
    if (this.#pendingWatch === peerId && this.#linked.has(peerId) && this.states[peerId]?.sharing) {
      this.watch(peerId);
    }
  }

  #outsidePreview(conversationId: string, userId: string, image: string) {
    if (!validPreview(image)) {
      return;
    }
    this.outsidePreviews[conversationId] = { ...this.outsidePreviews[conversationId], [userId]: image };
  }

  #pruneOutside(conversationId: string, sharingIds: string[]) {
    const previews = this.outsidePreviews[conversationId];
    if (!previews) {
      return;
    }
    const kept = Object.fromEntries(Object.entries(previews).filter(([id]) => sharingIds.includes(id)));
    if (Object.keys(kept).length) {
      this.outsidePreviews[conversationId] = kept;
    } else {
      delete this.outsidePreviews[conversationId];
    }
  }

  #forget(peerId: string) {
    this.#linked.delete(peerId);
    this.#peerDirect.delete(peerId);
    this.#outgoing.delete(peerId);
    this.#incoming.delete(peerId);
    delete this.states[peerId];
    delete this.previews[peerId];
    if (this.#viewers.delete(peerId)) {
      this.#sender?.remove(peerId);
      this.#syncCapture();
      this.#viewersChanged();
    }
    if (this.#receiverPeer === peerId) {
      this.#closeReceiver();
    }
    if (this.watchingId === peerId) {
      this.watchingId = null;
      this.screen = null;
    }
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
    this.stopShare(false);
    this.#stopCamera();
    this.cameras = {};
    this.#pendingWatch = null;
    this.#linked.clear();
    this.#closeReceiver();
    this.watchingId = null;
    this.screen = null;
    if (this.current && Object.keys(this.previews).length) {
      this.outsidePreviews[this.current.conversationId] = this.previews;
    }
    this.previews = {};
    if (this.current) {
      trail("call", "left the group call");
      playCue("ended");
    }
    this.#room?.close();
    this.#room = null;
    this.#peerDirect.clear();
    this.current = null;
    this.muted = false;
    this.deafened = false;
    this.speaking = new Set();
    this.states = {};
    this.connecting = false;
    this.latency = null;
    this.latencies = {};
  }

  #showLocked(peerId: string) {
    this.#showError(t("screen.locked", { name: this.nameOf(peerId) }));
  }

  #showError(message: string) {
    this.error = message;
    window.clearTimeout(this.#errorTimer);
    this.#errorTimer = window.setTimeout(() => (this.error = ""), 4000);
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
