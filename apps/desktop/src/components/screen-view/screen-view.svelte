<script lang="ts">
  import ViewerBadge from "@/components/viewer-badge/viewer-badge.svelte";
  import VolumeMenu from "@/components/volume-menu/volume-menu.svelte";
  import { t } from "@/i18n";
  import { preferences } from "@/stores/preferences.svelte";

  const idleAfter = 2500;

  let {
    stream,
    userId,
    name,
    quality,
    viewers,
    onclose,
  }: {
    stream: MediaStream | null;
    userId: string;
    name: string;
    quality: string;
    viewers: string[];
    onclose: () => void;
  } = $props();

  let menu = $state<{ x: number; y: number } | null>(null);
  let idle = $state(false);
  let holding = $state(false);
  let idleTimer: number | undefined;

  const volume = $derived(preferences.values.streamVolumes[userId] ?? 100);
  const label = $derived(quality ? `${name} · ${quality.replace(/\s+/g, "")}` : name);
  const hidden = $derived(idle && !holding && !menu && !!stream);

  function wake() {
    idle = false;
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => (idle = true), idleAfter);
  }

  function rest() {
    window.clearTimeout(idleTimer);
    idle = true;
    holding = false;
  }

  $effect(() => {
    wake();
    return () => window.clearTimeout(idleTimer);
  });

  function changeVolume(percent: number) {
    preferences.set("streamVolumes", { ...preferences.values.streamVolumes, [userId]: percent });
  }

  function openMenu(event: MouseEvent) {
    event.preventDefault();
    menu = { x: event.clientX, y: event.clientY };
  }

  let frame = $state<HTMLElement>();
  let video = $state<HTMLVideoElement>();
  let fullscreen = $state(false);
  let ratio = $state(16 / 9);

  function measure() {
    if (video?.videoWidth && video.videoHeight) {
      ratio = video.videoWidth / video.videoHeight;
    }
  }

  $effect(() => {
    if (video && video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => undefined);
    }
  });

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      frame?.requestFullscreen().catch(() => undefined);
    }
  }
</script>

<svelte:document onfullscreenchange={() => (fullscreen = document.fullscreenElement === frame)} />

<div
  class="screen-view"
  class:screen-view--fullscreen={fullscreen}
  class:screen-view--idle={hidden}
  style:--ratio={ratio}
  role="presentation"
  oncontextmenu={openMenu}
  onpointermove={wake}
  onpointerdown={wake}
  onpointerleave={rest}
  bind:this={frame}
>
  <video
    class="screen-view__video"
    bind:this={video}
    autoplay
    muted
    playsinline
    onloadedmetadata={measure}
    onresize={measure}
  >
    <track kind="captions" />
  </video>
  {#if !stream}
    <span class="screen-view__loading">{t("screen.loading")}</span>
  {/if}
  <div class="screen-view__labels">
    <span class="screen-view__live">{t("screen.live")}</span>
    <span class="screen-view__name">{label}</span>
    <span
      class="screen-view__viewers"
      role="presentation"
      onpointerenter={() => (holding = true)}
      onpointerleave={() => (holding = false)}
    >
      <ViewerBadge names={viewers} />
    </span>
  </div>
  <div
    class="screen-view__actions"
    role="presentation"
    onpointerenter={() => (holding = true)}
    onpointerleave={() => (holding = false)}
  >
    <button
      class="screen-view__button"
      aria-label={fullscreen ? t("screen.exitFullscreen") : t("screen.fullscreen")}
      data-tooltip={fullscreen ? t("screen.exitFullscreen") : t("screen.fullscreen")}
      onclick={toggleFullscreen}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        {#if fullscreen}
          <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
        {:else}
          <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
        {/if}
      </svg>
    </button>
    <button
      class="screen-view__button"
      aria-label={t("screen.stopWatching")}
      data-tooltip={t("screen.stopWatching")}
      onclick={onclose}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  </div>
  {#if menu && fullscreen}
    <VolumeMenu
      id="stream-volume"
      label={t("screen.volume", { name })}
      value={volume}
      x={menu.x}
      y={menu.y}
      onchange={changeVolume}
      onclose={() => (menu = null)}
    />
  {/if}
</div>

{#if menu && !fullscreen}
  <VolumeMenu
    id="stream-volume"
    label={t("screen.volume", { name })}
    value={volume}
    x={menu.x}
    y={menu.y}
    onchange={changeVolume}
    onclose={() => (menu = null)}
  />
{/if}

<style>
  .screen-view {
    position: relative;
    width: min(calc(100cqw - 2 * var(--previews-space, 0px)), calc(100cqh * var(--ratio)));
    aspect-ratio: var(--ratio);
    flex: none;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 10px;
    background: #000000;
    container-type: size;
  }

  .screen-view--fullscreen {
    width: 100vw;
    height: 100vh;
    aspect-ratio: auto;
    border-radius: 0;
  }

  .screen-view--idle {
    cursor: none;
  }

  .screen-view__video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .screen-view__loading {
    position: relative;
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  .screen-view__labels {
    position: absolute;
    left: 10px;
    right: 96px;
    top: 10px;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: opacity ease 0.2s;
  }

  .screen-view__live {
    flex: none;
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--error-color);
    color: #ffffff;
    font-size: var(--tiny-font-size);
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .screen-view__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.55);
    color: var(--muted-color);
    font-size: var(--small-font-size);
  }

  .screen-view__viewers {
    flex: none;
    display: flex;
  }

  .screen-view__actions {
    position: absolute;
    right: 10px;
    top: 10px;
    display: flex;
    gap: 6px;
    transition: opacity ease 0.2s;
  }

  .screen-view--idle .screen-view__labels,
  .screen-view--idle .screen-view__actions:not(:has(:focus-visible)) {
    opacity: 0;
    pointer-events: none;
  }

  .screen-view__button {
    width: 34px;
    height: 34px;
    padding: 8px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.55);
    color: var(--muted-color);
    transition: background ease 0.1s;
  }

  .screen-view__button:hover {
    background: rgba(0, 0, 0, 0.75);
  }

  @container (max-width: 300px) {
    .screen-view__name {
      display: none;
    }
  }

  @container (max-width: 260px) {
    .screen-view__labels {
      top: 50px;
      right: 10px;
    }
  }

  @container (max-width: 140px) {
    .screen-view__labels {
      display: none;
    }
  }

  @container (max-width: 96px) {
    .screen-view__actions {
      display: none;
    }
  }

  @container (max-height: 110px) {
    .screen-view__labels,
    .screen-view__actions {
      display: none;
    }
  }
</style>
