<script lang="ts">
  import { onDestroy } from "svelte";
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import CallTile from "@/components/call-tile/call-tile.svelte";
  import CallSecurity from "@/components/call-security/call-security.svelte";
  import ScreenPicker from "@/components/screen-picker/screen-picker.svelte";
  import ResizeHandle from "@/components/resize-handle/resize-handle.svelte";
  import ScreenPreview from "@/components/screen-preview/screen-preview.svelte";
  import ScreenView from "@/components/screen-view/screen-view.svelte";
  import { Elapsed } from "@/helpers/duration.svelte";
  import { fitTiles } from "@/helpers/tiles";
  import { t } from "@/i18n";
  import { calls, type Current } from "@/stores/call.svelte";
  import type { User } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";
  import { preferences } from "@/stores/preferences.svelte";
  import CallVolumeMenu from "./call-volume-menu.svelte";

  let { call }: { call: Current } = $props();

  let menu = $state<{ user: User; x: number; y: number } | null>(null);
  let picking = $state(false);

  const peerLive = $derived(!!calls.peerSharing && !calls.watching);
  const previewCount = $derived(Number(calls.sharing) + Number(peerLive));

  function previewWidth(count: number): number {
    return count <= 1 ? 144 : count === 2 ? 112 : 88;
  }

  function openMenu(event: MouseEvent, user: User) {
    event.preventDefault();
    menu = { user, x: event.clientX, y: event.clientY };
  }

  function menuKey(event: KeyboardEvent, user: User) {
    if (event.key === "Enter" || event.key === "ContextMenu") {
      event.preventDefault();
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
      menu = { user, x: box.left, y: box.bottom + 8 };
    }
  }

  const elapsed = new Elapsed();
  onDestroy(() => elapsed.stop());

  const status = $derived(
    call.status === "outgoing"
      ? t("call.calling")
      : call.startedAt
        ? elapsed.format(call.startedAt)
        : t("call.connecting"),
  );

  const watchMinimum = 320;
  const watchingNow = $derived(calls.watching);
  const squares = $derived(!!calls.camera || !!calls.peerCamera);
  const morphKey = $derived(`${!!calls.camera}${!!calls.peerCamera}`);
  let morphing = $state(false);
  let morphTimer: number | undefined;

  $effect.pre(() => {
    void morphKey;
    morphing = true;
    window.clearTimeout(morphTimer);
    morphTimer = window.setTimeout(() => (morphing = false), 300);
  });

  $effect(() => () => window.clearTimeout(morphTimer));
  const panelHeight = $derived.by(() => {
    const height = watchingNow ? Math.max(watchMinimum, preferences.values.watchHeight) : preferences.values.callHeight;
    return height ? `${height}px` : undefined;
  });
  const previewInset = $derived(!watchingNow && previewCount > 0 ? previewWidth(previewCount) + 24 : 0);
  const sideWidth = $derived(`${Math.max(previewCount > 0 ? previewWidth(previewCount) : 0, 76)}px`);

  const tileBase = 80;
  const tileMax = 320;
  const tileGap = 32;
  const tileRoom = 16;

  function watchHint(name: string): string {
    return t(calls.peerLocked ? "screen.locked" : "screen.watch", { name });
  }

  let peopleWidth = $state(0);
  let peopleHeight = $state(0);

  const layout = $derived(
    fitTiles(
      call.status === "incoming" ? 1 : 2,
      peopleWidth - 2 * previewInset,
      peopleHeight - tileRoom,
      tileBase,
      tileMax,
      tileGap,
    ),
  );
</script>

{#snippet person(
  user: User,
  speaking: boolean,
  muted: boolean,
  deafened: boolean,
  adjustable: boolean,
  ringing = false,
  live = false,
  stream: MediaStream | null = null,
)}
  <span
    class="call-panel__person"
    class:call-panel__person--speaking={speaking && !muted}
    class:call-panel__person--ringing={ringing}
    class:call-panel__person--camera={!!stream}
  >
    {#if adjustable}
      <button
        class="call-panel__adjust"
        aria-haspopup="dialog"
        aria-label={live ? watchHint(user.username) : t("call.userVolume", { name: user.username })}
        data-tooltip={live ? watchHint(user.username) : undefined}
        class:call-panel__adjust--live={live}
        onclick={() => live && calls.watch()}
        oncontextmenu={(event) => openMenu(event, user)}
        onkeydown={(event) => menuKey(event, user)}
      >
        <CallTile {user} {stream} />
      </button>
    {:else}
      <CallTile {user} {stream} />
    {/if}
    {#if deafened || muted}
      <span
        class="call-panel__badge"
        role="img"
        aria-label={deafened
          ? t("call.peerDeafened", { name: user.username })
          : t("call.peerMuted", { name: user.username })}
      >
        <CallIcon name={deafened ? "headphonesOff" : "micOff"} />
      </span>
    {/if}
    {#if stream}
      <span
        class="call-panel__badge call-panel__badge--camera"
        role="img"
        aria-label={t("call.peerCamera", { name: user.username })}
      >
        <CallIcon name="camera" />
      </span>
    {/if}
    {#if live}
      <span class="call-panel__live">{t("screen.live")}</span>
    {/if}
  </span>
{/snippet}

{#if chat.user}
  <section
    class="call-panel"
    class:call-panel--watching={calls.watching}
    style:height={panelHeight}
    style:--previews-space="{previewInset}px"
    style:--side={sideWidth}
    aria-label={t("call.panel")}
  >
    {#if call.status === "incoming"}
      <div
        class="call-panel__people"
        bind:clientWidth={peopleWidth}
        bind:clientHeight={peopleHeight}
        style:--tile="{layout.tile}px"
        style:--photo="{layout.photo}px"
        style:min-height="{layout.minHeight + tileRoom}px"
      >
        {@render person(call.peer, false, false, false, false)}
      </div>
      <div class="call-panel__controls">
        <button
          class="call-panel__button call-panel__button--hang-up"
          aria-label={t("call.decline")}
          data-tooltip={t("call.decline")}
          onclick={() => calls.decline()}
        >
          <CallIcon name="hangUp" />
        </button>
        {#if !call.quiet && !call.hidden && preferences.values.callSounds}
          <button
            class="call-panel__button"
            aria-label={t("call.hide")}
            data-tooltip={t("call.hide")}
            onclick={() => calls.hide()}
          >
            <CallIcon name="dash" />
          </button>
        {/if}
        <button
          class="call-panel__button call-panel__button--join"
          aria-label={t("call.answer")}
          data-tooltip={t("call.answer")}
          onclick={() => calls.answer()}
        >
          <CallIcon name="phone" />
        </button>
      </div>
    {:else}
      {#if calls.watching}
        <div class="call-panel__stage">
          <ScreenView
            stream={calls.screen}
            userId={call.peer.id}
            name={call.peer.username}
            quality={calls.peerSharing ?? ""}
            viewers={[chat.user.username]}
            onclose={() => calls.unwatch()}
          />
        </div>
      {/if}
      <div
        class="call-panel__people"
        class:call-panel__people--squares={squares}
        class:call-panel__people--morphing={morphing}
        bind:clientWidth={peopleWidth}
        bind:clientHeight={peopleHeight}
        style:--tile={watchingNow ? undefined : `${layout.tile}px`}
        style:--photo={watchingNow ? undefined : `${layout.photo}px`}
        style:min-height={watchingNow ? undefined : `${layout.minHeight + tileRoom}px`}
      >
        {@render person(
          chat.user,
          calls.selfSpeaking,
          calls.muted,
          calls.deafened,
          false,
          false,
          calls.sharing,
          calls.camera,
        )}
        {@render person(
          call.peer,
          calls.peerSpeaking,
          calls.peerMuted,
          calls.peerDeafened,
          call.status !== "outgoing",
          call.status === "outgoing",
          !!calls.peerSharing,
          calls.peerCamera,
        )}
      </div>
      {#if previewCount > 0}
        <div class="call-panel__previews">
          {#if calls.sharing}
            <ScreenPreview
              image={calls.ownPreview}
              name={chat.user.username}
              width={previewWidth(previewCount)}
              viewers={calls.peerWatching ? [call.peer.username] : []}
              own
            />
          {/if}
          {#if peerLive}
            <ScreenPreview
              image={calls.peerPreview}
              name={call.peer.username}
              width={previewWidth(previewCount)}
              locked={calls.peerLocked}
              onwatch={() => calls.watch()}
            />
          {/if}
        </div>
      {/if}
      <span class="call-panel__status" aria-live="polite">
        {status}
        {#if call.status === "active"}
          <CallSecurity peers={[{ id: call.peer.id, name: call.peer.username }]} />
        {/if}
      </span>
      <div class="call-panel__controls">
        <button
          class="call-panel__button"
          class:call-panel__button--off={calls.muted}
          aria-label={calls.muted ? t("call.unmute") : t("call.mute")}
          data-tooltip={calls.muted ? t("call.unmute") : t("call.mute")}
          aria-pressed={calls.muted}
          onclick={() => calls.toggleMute()}
        >
          <CallIcon name={calls.muted ? "micOff" : "mic"} />
        </button>
        <button
          class="call-panel__button"
          class:call-panel__button--off={calls.deafened}
          aria-label={calls.deafened ? t("call.undeafen") : t("call.deafen")}
          data-tooltip={calls.deafened ? t("call.undeafen") : t("call.deafen")}
          aria-pressed={calls.deafened}
          onclick={() => calls.toggleDeafen()}
        >
          <CallIcon name={calls.deafened ? "headphonesOff" : "headphones"} />
        </button>
        {#if call.status === "active" || call.caller}
          <button
            class="call-panel__button"
            class:call-panel__button--off={!!calls.camera}
            aria-label={calls.camera ? t("call.cameraOff") : t("call.cameraOn")}
            data-tooltip={calls.camera ? t("call.cameraOff") : t("call.cameraOn")}
            aria-pressed={!!calls.camera}
            onclick={() => calls.toggleCamera()}
          >
            <CallIcon name="camera" />
          </button>
        {/if}
        {#if call.status === "active"}
          <span class="call-panel__share">
            <button
              class="call-panel__button"
              class:call-panel__button--off={calls.sharing}
              aria-label={calls.sharing ? t("screen.options") : t("screen.share")}
              data-tooltip={calls.sharing ? t("screen.options") : t("screen.share")}
              aria-pressed={calls.sharing}
              onclick={() => (picking = !picking)}
            >
              <CallIcon name="screen" />
            </button>
            {#if picking}
              <ScreenPicker
                current={calls.shareSettings}
                onshare={(sourceId, quality) => calls.startShare(sourceId, quality)}
                onstop={() => calls.stopShare()}
                onclose={() => (picking = false)}
              />
            {/if}
          </span>
        {/if}
        <button
          class="call-panel__button call-panel__button--hang-up"
          aria-label={t("call.hangUp")}
          data-tooltip={t("call.hangUp")}
          onclick={() => calls.hangUp()}
        >
          <CallIcon name="hangUp" />
        </button>
      </div>
    {/if}
    <ResizeHandle setting={watchingNow ? "watchHeight" : "callHeight"} minimum={watchingNow ? watchMinimum : 180} />
  </section>
{/if}

{#if menu}
  <CallVolumeMenu user={menu.user} x={menu.x} y={menu.y} onclose={() => (menu = null)} />
{/if}

<style>
  .call-panel {
    position: relative;
    max-height: calc(100% - 200px);
    flex: none;
    justify-content: center;
    padding: 28px var(--page-gutter) 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    background: #090909;
    border-bottom: 1px solid var(--border-color);
  }

  .call-panel__people {
    align-self: stretch;
    flex: 1 1 0;
    padding: 0 var(--previews-space);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    align-content: center;
    justify-content: center;
    gap: 32px;
    contain: size;
  }

  .call-panel__person {
    --size: var(--photo);
    position: relative;
    width: var(--size);
    height: var(--size);
    flex: none;
    display: flex;
    border-radius: 50%;
    box-shadow:
      0 0 0 3px #090909,
      0 0 0 6px transparent;
    transition:
      box-shadow ease 0.15s,
      border-radius ease 0.25s;
  }

  .call-panel__person :global(.avatar) {
    border-radius: inherit;
  }

  .call-panel__people--squares .call-panel__person {
    --size: var(--tile);
    border-radius: 14px;
  }

  .call-panel__people--morphing .call-panel__person {
    transition:
      box-shadow ease 0.15s,
      border-radius ease 0.25s,
      width ease 0.25s,
      height ease 0.25s;
  }

  .call-panel__person--speaking {
    box-shadow:
      0 0 0 3px #090909,
      0 0 0 6px var(--success-color);
  }

  .call-panel__people .call-panel__person--camera {
    --size: var(--tile);
    border-radius: 14px;
  }

  .call-panel__adjust {
    width: 100%;
    height: 100%;
    padding: 0;
    display: flex;
    border: 0;
    border-radius: inherit;
    background: transparent;
    cursor: context-menu;
  }

  .call-panel__adjust--live {
    cursor: pointer;
  }

  .call-panel__badge {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 28px;
    height: 28px;
    padding: 6px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--dark-background-color);
    border: 2px solid #090909;
    color: #f6746b;
  }

  .call-panel__badge--camera {
    left: -4px;
    right: auto;
    color: var(--muted-color);
  }

  .call-panel__status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
    font-variant-numeric: tabular-nums;
  }

  .call-panel__controls {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .call-panel__button {
    width: 48px;
    height: 48px;
    padding: 14px;
    flex: none;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    color: var(--muted-color);
    transition: background ease 0.1s;
  }

  .call-panel__button:hover {
    background: rgba(255, 255, 255, 0.14);
  }

  .call-panel__button--off,
  .call-panel__button--off:hover {
    background: var(--muted-color);
    color: var(--on-brand-color);
  }

  .call-panel__button--hang-up,
  .call-panel__button--hang-up:hover {
    background: var(--error-color);
    color: #ffffff;
  }

  .call-panel__button--hang-up:hover {
    background: #c8173f;
  }

  .call-panel__button--join,
  .call-panel__button--join:hover {
    background: var(--success-color);
    color: #ffffff;
  }

  .call-panel__button--join:hover {
    background: #178540;
  }

  .call-panel__person--ringing {
    animation: call-panel__person-ringing 1.4s ease-out infinite;
  }

  .call-panel__person--ringing :global(.avatar) {
    filter: saturate(0.2) brightness(0.75);
  }

  @keyframes call-panel__person-ringing {
    from {
      box-shadow:
        0 0 0 3px #090909,
        0 0 0 3px rgba(142, 145, 155, 0.7);
    }
    to {
      box-shadow:
        0 0 0 3px #090909,
        0 0 0 14px rgba(142, 145, 155, 0);
    }
  }

  .call-panel__live {
    position: absolute;
    left: 50%;
    bottom: -8px;
    padding: 1px 6px;
    transform: translateX(-50%);
    border-radius: 4px;
    border: 2px solid #090909;
    background: var(--error-color);
    color: #ffffff;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    white-space: nowrap;
    pointer-events: none;
  }

  .call-panel__share {
    position: relative;
    display: flex;
  }

  .call-panel__previews {
    position: absolute;
    left: var(--page-gutter);
    top: 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .call-panel--watching {
    padding-top: 16px;
    padding-bottom: 16px;
  }

  .call-panel:not(.call-panel--watching) {
    min-height: max-content;
  }

  .call-panel__stage {
    width: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .call-panel--watching .call-panel__stage {
    flex: 1 1 auto;
    padding: 0 calc(var(--side) + 16px);
    justify-content: center;
    container-type: size;
  }

  .call-panel--watching .call-panel__previews {
    top: 16px;
  }

  .call-panel--watching .call-panel__people {
    position: absolute;
    top: 16px;
    right: var(--page-gutter);
    bottom: 120px;
    width: var(--side);
    padding: 6px 0;
    flex-direction: column;
    flex-wrap: nowrap;
    justify-content: flex-start;
    gap: 18px;
    overflow-y: auto;
  }

  .call-panel--watching .call-panel__people {
    --photo: 52px;
    --tile: calc(var(--side) - 12px);
  }

  .call-panel--watching .call-panel__person--camera {
    border-radius: 12px;
  }

  .call-panel--watching .call-panel__people--squares .call-panel__person {
    border-radius: 12px;
  }
</style>
