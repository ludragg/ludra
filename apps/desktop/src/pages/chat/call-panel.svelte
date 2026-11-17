<script lang="ts">
  import { onDestroy } from "svelte";
  import { Avatar } from "@/components";
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import CallSecurity from "@/components/call-security/call-security.svelte";
  import ScreenPicker from "@/components/screen-picker/screen-picker.svelte";
  import ResizeHandle from "@/components/resize-handle/resize-handle.svelte";
  import ScreenPreview from "@/components/screen-preview/screen-preview.svelte";
  import ScreenView from "@/components/screen-view/screen-view.svelte";
  import { Elapsed } from "@/helpers/duration.svelte";
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

  function toggleShare() {
    if (calls.sharing) {
      calls.stopShare();
    } else {
      picking = !picking;
    }
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
  const panelHeight = $derived.by(() => {
    const height = watchingNow ? Math.max(watchMinimum, preferences.values.watchHeight) : preferences.values.callHeight;
    return height ? `${height}px` : undefined;
  });
  const previewSpace = $derived(!watchingNow && previewCount > 0 ? `${previewWidth(previewCount) + 24}px` : "0px");
  const sideWidth = $derived(`${Math.max(previewCount > 0 ? previewWidth(previewCount) : 0, 76)}px`);
</script>

{#snippet person(
  user: User,
  speaking: boolean,
  muted: boolean,
  deafened: boolean,
  adjustable: boolean,
  ringing = false,
  live = false,
)}
  <span
    class="call-panel__person"
    class:call-panel__person--speaking={speaking && !muted}
    class:call-panel__person--ringing={ringing}
  >
    {#if adjustable}
      <button
        class="call-panel__adjust"
        aria-haspopup="dialog"
        aria-label={live ? t("screen.watch", { name: user.username }) : t("call.userVolume", { name: user.username })}
        title={live ? t("screen.watch", { name: user.username }) : undefined}
        class:call-panel__adjust--live={live}
        onclick={() => live && calls.watch()}
        oncontextmenu={(event) => openMenu(event, user)}
        onkeydown={(event) => menuKey(event, user)}
      >
        <Avatar {user} size="call" />
      </button>
    {:else}
      <Avatar {user} size="call" />
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
    style:--previews-space={previewSpace}
    style:--side={sideWidth}
    aria-label={t("call.panel")}
  >
    {#if call.status === "incoming"}
      <div class="call-panel__people">
        {@render person(call.peer, false, false, false, false)}
      </div>
      <div class="call-panel__controls">
        <button
          class="call-panel__button call-panel__button--hang-up"
          aria-label={t("call.decline")}
          title={t("call.decline")}
          onclick={() => calls.decline()}
        >
          <CallIcon name="hangUp" />
        </button>
        {#if !call.quiet && !call.hidden && preferences.values.callSounds}
          <button
            class="call-panel__button"
            aria-label={t("call.hide")}
            title={t("call.hide")}
            onclick={() => calls.hide()}
          >
            <CallIcon name="dash" />
          </button>
        {/if}
        <button
          class="call-panel__button call-panel__button--join"
          aria-label={t("call.answer")}
          title={t("call.answer")}
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
      <div class="call-panel__people">
        {@render person(chat.user, calls.selfSpeaking, calls.muted, calls.deafened, false, false, calls.sharing)}
        {@render person(
          call.peer,
          calls.peerSpeaking,
          calls.peerMuted,
          calls.peerDeafened,
          call.status !== "outgoing",
          call.status === "outgoing",
          !!calls.peerSharing,
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
          title={calls.muted ? t("call.unmute") : t("call.mute")}
          aria-pressed={calls.muted}
          onclick={() => calls.toggleMute()}
        >
          <CallIcon name={calls.muted ? "micOff" : "mic"} />
        </button>
        <button
          class="call-panel__button"
          class:call-panel__button--off={calls.deafened}
          aria-label={calls.deafened ? t("call.undeafen") : t("call.deafen")}
          title={calls.deafened ? t("call.undeafen") : t("call.deafen")}
          aria-pressed={calls.deafened}
          onclick={() => calls.toggleDeafen()}
        >
          <CallIcon name={calls.deafened ? "headphonesOff" : "headphones"} />
        </button>
        {#if call.status === "active"}
          <span class="call-panel__share">
            <button
              class="call-panel__button"
              class:call-panel__button--off={calls.sharing}
              aria-label={calls.sharing ? t("screen.stop") : t("screen.share")}
              title={calls.sharing ? t("screen.stop") : t("screen.share")}
              aria-pressed={calls.sharing}
              onclick={toggleShare}
            >
              <CallIcon name="screen" />
            </button>
            {#if picking}
              <ScreenPicker
                onshare={(sourceId, quality) => calls.startShare(sourceId, quality)}
                onclose={() => (picking = false)}
              />
            {/if}
          </span>
        {/if}
        <button
          class="call-panel__button call-panel__button--hang-up"
          aria-label={t("call.hangUp")}
          title={t("call.hangUp")}
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
    display: flex;
    align-items: center;
    gap: 32px;
  }

  .call-panel__person {
    position: relative;
    display: flex;
    border-radius: 50%;
    box-shadow:
      0 0 0 3px #090909,
      0 0 0 6px transparent;
    transition: box-shadow ease 0.15s;
  }

  .call-panel__person--speaking {
    box-shadow:
      0 0 0 3px #090909,
      0 0 0 6px var(--success-color);
  }

  .call-panel__adjust {
    padding: 0;
    display: flex;
    border: 0;
    border-radius: 50%;
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
    color: var(--dark-background-color);
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

  .call-panel--watching :global(.avatar) {
    width: 52px;
    height: 52px;
    font-size: 20px;
  }
</style>
