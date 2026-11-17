import { t } from "@/i18n";
import { SignalKind, type CallSignal, type GroupCall, type User } from "@/protocol/ludra/v1/models_pb";
import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
import { ServerError, type Client } from "@/services/client";
import { notify, windowFocused } from "@/services/desktop";
import { playCue, setRingtone } from "@/services/ringtone";
import { VoiceRoom } from "@/services/voice-room";
import { captureScreen, hintScreenTracks, qualityLabel, type ScreenQuality } from "@/services/screen";
import type { NativeScreen } from "@/services/native-screen";
import { parseVoiceMessage, previewMessage, stateMessage, watchMessage, type VoiceState } from "@/helpers/voice-state";
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
  watchingId = $state<string | null>(null);
  previews = $state<Record<string, string>>({});
  ownPreview = $state<string | null>(null);
  screen = $state.raw<MediaStream | null>(null);
  latency = $state<number | null>(null);
  error = $state("");
  friendly: (userId: string) => boolean = () => false;

  #client: Client | null = null;
  #room: VoiceRoom | null = null;
  #direct = false;
  #started: Promise<void> = Promise.resolve();
  #mutedBeforeDeafen = false;
  #beforeTest: { muted: boolean; deafened: boolean } | null = null;
  #ringTimer: number | undefined;
  #calling = false;
  #share: MediaStream | null = null;
  #capture: NativeScreen | null = null;
  #shareQuality: ScreenQuality | null = null;
  #viewers = new Set<string>();
  #preview: string | null = null;
  #shareBusy = false;
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
  }

  detach() {
    this.#dismiss();
    this.#finish();
    this.#latest.clear();
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
      this.#direct = preferences.values.directCalls;
      const joined = await this.#client.joinGroupCall(conversationId, this.#direct);
      await trust.prepare(joined.participantIds);
      room = new VoiceRoom(joined.iceServers, selfId);
      room.directWith = (peerId) =>
        this.#direct && this.friendly(peerId) && !!this.#latest.get(conversationId)?.directIds.includes(peerId);
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
      room.setDeafened(this.deafened);
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
      this.#forget(peerId);
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
    };
    room.onSpeaking = (speaking) => (this.speaking = speaking);
    room.onLatency = (milliseconds) => (this.latency = room.peers().length ? milliseconds : null);
    room.onPeerConnected = () => {
      this.#shareState();
      this.#sendPreview();
    };
    room.onPeerFailed = (peerId) => {
      room.remove(peerId);
      this.#forget(peerId);
    };
    room.onScreen = (peerId, stream) => {
      if (this.watchingId === peerId) {
        this.screen = stream;
      }
    };
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
      this.states[signal.peerId] = { muted: message.muted, deafened: message.deafened, sharing: message.sharing };
      if (!message.sharing) {
        delete this.previews[signal.peerId];
      }
      if (!message.sharing && this.watchingId === signal.peerId) {
        this.watchingId = null;
        this.screen = null;
      }
      return;
    }
    const peerId = signal.peerId;
    const previous = this.#incoming.get(peerId) ?? Promise.resolve();
    const next = previous.then(async () => {
      await this.#started.catch(() => undefined);
      let payload: string;
      try {
        payload = await trust.open(signal.callId, peerId, signal.kind, signal.payload);
      } catch {
        this.#showError(t("call.insecure"));
        room.remove(peerId);
        this.#forget(peerId);
        return;
      }
      await room.receive(peerId, signal.kind, payload).catch(() => {
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
    const payload = stateMessage({ muted: this.muted, deafened: this.deafened, sharing });
    this.#client?.sendSignal(current.id, SignalKind.STATE, payload, "*").catch(() => undefined);
  }

  async startShare(sourceId: string, quality: ScreenQuality) {
    const room = this.#room;
    if (!this.current || !room || this.#shareBusy) {
      return;
    }
    this.#shareBusy = true;
    try {
      const capture = await captureScreen(sourceId, quality);
      if (this.#room !== room) {
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
        this.#preview = image;
        this.ownPreview = image;
        this.#sendPreview();
      };
      capture.onEnded = () => {
        if (this.#share === stream) {
          this.stopShare();
        }
      };
      capture.setWatched(this.#viewers.size > 0);
      for (const viewer of this.#viewers) {
        await room.setScreen(viewer, stream, quality).catch(() => undefined);
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
    this.#preview = null;
    this.ownPreview = null;
    this.#capture?.stop();
    this.#capture = null;
    for (const viewer of this.#viewers) {
      this.#room?.setScreen(viewer, null, null).catch(() => undefined);
    }
    this.#viewers.clear();
    if (announce) {
      this.#shareState();
    }
  }

  watch(peerId: string) {
    const current = this.current;
    if (!current || !this.states[peerId]?.sharing || this.watchingId === peerId) {
      return;
    }
    this.unwatch();
    this.watchingId = peerId;
    this.screen = this.#room?.screen(peerId) ?? null;
    this.#client?.sendSignal(current.id, SignalKind.STATE, watchMessage(true), peerId).catch(() => undefined);
  }

  unwatch() {
    const current = this.current;
    const peerId = this.watchingId;
    if (!peerId) {
      return;
    }
    this.watchingId = null;
    this.screen = null;
    if (current) {
      this.#client?.sendSignal(current.id, SignalKind.STATE, watchMessage(false), peerId).catch(() => undefined);
    }
  }

  async #setViewer(peerId: string, watching: boolean) {
    if (watching && this.#share) {
      this.#viewers.add(peerId);
      this.#capture?.setWatched(true);
      await this.#room?.setScreen(peerId, this.#share, this.#shareQuality).catch(() => undefined);
    } else if (this.#viewers.delete(peerId)) {
      this.#capture?.setWatched(this.#viewers.size > 0);
      await this.#room?.setScreen(peerId, null, null).catch(() => undefined);
    }
  }

  #sendPreview() {
    const current = this.current;
    if (current && this.sharing && this.#preview) {
      this.#client?.sendSignal(current.id, SignalKind.STATE, previewMessage(this.#preview), "*").catch(() => undefined);
    }
  }

  #forget(peerId: string) {
    this.#outgoing.delete(peerId);
    this.#incoming.delete(peerId);
    delete this.states[peerId];
    delete this.previews[peerId];
    if (this.#viewers.delete(peerId)) {
      this.#capture?.setWatched(this.#viewers.size > 0);
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
    this.watchingId = null;
    this.screen = null;
    this.previews = {};
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
