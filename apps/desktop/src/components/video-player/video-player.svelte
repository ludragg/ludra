<script lang="ts">
  import FolderButton from "@/components/folder-button/folder-button.svelte";
  import MediaHint from "@/components/media-hint/media-hint.svelte";
  import { clock } from "@/helpers/time";
  import { t } from "@/i18n";

  let {
    source,
    caption,
    name = "",
    detail = "",
    pinned = false,
    autoplay = false,
    onrequest,
    onfolder = null,
  }: {
    source: string | null;
    caption: string;
    name?: string;
    detail?: string;
    pinned?: boolean;
    autoplay?: boolean;
    onrequest?: () => void;
    onfolder?: (() => void) | null;
  } = $props();

  const hideAfter = 2500;

  let box = $state<HTMLElement>();
  let video = $state<HTMLVideoElement>();
  let started = $state(false);
  let failed = $state(false);

  $effect(() => {
    void source;
    failed = false;
  });
  let playing = $state(false);
  let current = $state(0);
  let duration = $state(0);
  let volume = $state(1);
  let muted = $state(false);
  let idle = $state(false);
  let hovered = $state(false);
  let fullscreen = $state(false);
  let ratio = $state("16 / 9");
  let timer = 0;

  const revealed = $derived(pinned || (hovered && !idle));

  $effect(() => {
    if (source && autoplay) {
      started = true;
    }
  });

  function start() {
    if (source) {
      started = true;
    } else {
      onrequest?.();
    }
  }

  function toggle() {
    if (!video) {
      return;
    }
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }

  function seek(event: Event) {
    if (video) {
      video.currentTime = Number((event.currentTarget as HTMLInputElement).value);
    }
  }

  function changeVolume(event: Event) {
    if (video) {
      video.volume = Number((event.currentTarget as HTMLInputElement).value);
      video.muted = video.volume === 0;
    }
  }

  function toggleMute() {
    if (video) {
      video.muted = !video.muted;
      if (!video.muted && video.volume === 0) {
        video.volume = 0.5;
      }
    }
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await box?.requestFullscreen();
    }
  }

  function awake() {
    idle = false;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => (idle = playing), hideAfter);
  }

  function measured(element: HTMLVideoElement) {
    if (element.videoWidth > 0 && element.videoHeight > 0) {
      ratio = `${element.videoWidth} / ${element.videoHeight}`;
      duration = element.duration;
    }
  }

  function sync() {
    if (video) {
      playing = !video.paused;
      current = video.currentTime;
      volume = video.volume;
      muted = video.muted;
    }
  }
</script>

<svelte:document onfullscreenchange={() => (fullscreen = document.fullscreenElement === box)} />

<div
  class="video-player"
  class:video-player--idle={idle}
  class:video-player--fullscreen={fullscreen}
  style:aspect-ratio={fullscreen ? "auto" : ratio}
  bind:this={box}
  role="presentation"
  onpointermove={awake}
  onpointerenter={() => (hovered = true)}
  onpointerleave={() => (hovered = false)}
>
  {#if started && source && !failed}
    <video
      class="video-player__video"
      src={source}
      autoplay
      bind:this={video}
      onclick={toggle}
      onloadedmetadata={(event) => measured(event.currentTarget)}
      onplay={() => {
        sync();
        awake();
      }}
      onpause={() => {
        sync();
        idle = false;
      }}
      onended={() => (current = duration)}
      ontimeupdate={sync}
      onvolumechange={sync}
      onerror={() => (failed = true)}
    >
      <track kind="captions" />
    </video>
    <div class="video-player__controls">
      <button
        type="button"
        class="video-player__control"
        aria-label={playing ? t("chat.pause") : t("chat.play")}
        onclick={toggle}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          {#if playing}
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          {:else}
            <path d="M8 6.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 8 6.5z" />
          {/if}
        </svg>
      </button>
      <span class="video-player__time">{clock(current)} / {clock(duration)}</span>
      <input
        class="video-player__range video-player__range--seek"
        type="range"
        min="0"
        max={duration || 0}
        step="0.1"
        value={current}
        style:--fill="{duration ? (current / duration) * 100 : 0}%"
        aria-label={t("chat.play")}
        oninput={seek}
      />
      <div class="video-player__volume">
        <button
          type="button"
          class="video-player__control"
          aria-label={muted ? t("chat.unmute") : t("chat.mute")}
          onclick={toggleMute}
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
            <path d="M11 5L6 9H2v6h4l5 4z" />
            {#if muted || volume === 0}
              <path d="M22 9l-6 6M16 9l6 6" />
            {:else}
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            {/if}
          </svg>
        </button>
        <input
          class="video-player__range video-player__range--volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={muted ? 0 : volume}
          style:--fill="{(muted ? 0 : volume) * 100}%"
          aria-label={t("chat.mute")}
          oninput={changeVolume}
        />
      </div>
      <button
        type="button"
        class="video-player__control"
        aria-label={fullscreen ? t("chat.exitFullscreen") : t("chat.fullscreen")}
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
            <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          {:else}
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          {/if}
        </svg>
      </button>
    </div>
  {:else if failed}
    <div class="video-player__message">
      <span>{t("chat.videoUnsupported")}</span>
      {#if onfolder}
        <button type="button" class="video-player__link" onclick={onfolder}>{t("chat.openFolder")}</button>
      {/if}
    </div>
  {:else}
    {#if source}
      <video
        class="video-player__poster"
        src="{source}#t=0.1"
        preload="metadata"
        muted
        tabindex="-1"
        aria-hidden="true"
        onloadedmetadata={(event) => measured(event.currentTarget)}
      ></video>
    {/if}
    <button
      type="button"
      class="video-player__play"
      aria-label={source ? t("chat.playVideo") : t("chat.downloadToWatch")}
      data-tooltip={source ? t("chat.playVideo") : t("chat.downloadToWatch")}
      onclick={start}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 6.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 8 6.5z" />
      </svg>
    </button>
    {#if caption}
      <span class="video-player__caption">{caption}</span>
    {/if}
  {/if}
  {#if name}
    <MediaHint {name} {detail} visible={revealed} />
  {/if}
  {#if onfolder}
    <span class="video-player__folder" class:video-player__folder--visible={revealed}>
      <FolderButton variant="overlay" onclick={onfolder} />
    </span>
  {/if}
</div>

<style>
  .video-player {
    position: relative;
    width: 100%;
    max-height: 420px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 8px;
    background: #000000;
  }

  .video-player--fullscreen {
    width: 100%;
    height: 100%;
    max-height: none;
    overflow: visible;
    border-radius: 0;
  }

  .video-player--idle {
    cursor: none;
  }

  .video-player__video {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
    background: #000000;
  }

  .video-player--fullscreen .video-player__video {
    position: absolute;
    inset: 0;
  }

  .video-player__controls {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 18px 10px 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(0deg, rgba(0, 0, 0, 0.75), transparent);
    color: var(--muted-color);
    transition:
      opacity ease 0.2s,
      visibility 0s linear 0s;
  }

  .video-player--idle .video-player__controls {
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transition:
      opacity ease 0.2s,
      visibility 0s linear 0.2s;
  }

  .video-player__control {
    width: 28px;
    height: 28px;
    flex: none;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted-color);
  }

  .video-player__control:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .video-player__control svg {
    width: 16px;
  }

  .video-player__time {
    flex: none;
    font-size: var(--small-font-size);
    font-variant-numeric: tabular-nums;
  }

  .video-player__range {
    --fill: 0%;
    height: 16px;
    margin: 0;
    appearance: none;
    background: transparent;
    cursor: pointer;
  }

  .video-player__range--seek {
    min-width: 0;
    flex-grow: 1;
  }

  .video-player__range::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--brand-color) var(--fill), rgba(255, 255, 255, 0.25) var(--fill));
  }

  .video-player__range::-webkit-slider-thumb {
    width: 12px;
    height: 12px;
    margin-top: -4px;
    appearance: none;
    border-radius: 50%;
    background: var(--muted-color);
  }

  .video-player__volume {
    display: flex;
    align-items: center;
  }

  .video-player__range--volume {
    width: 0;
    opacity: 0;
    transition:
      width ease 0.15s,
      opacity ease 0.15s;
  }

  .video-player__volume:hover .video-player__range--volume,
  .video-player__range--volume:focus-visible {
    width: 64px;
    margin-left: 4px;
    opacity: 1;
  }

  .video-player__folder {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 2;
    width: 44px;
    height: 44px;
    opacity: 0;
    transition: opacity ease 0.15s;
  }

  .video-player__folder--visible,
  .video-player__folder:focus-within {
    opacity: 1;
  }

  .video-player__poster {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  }

  .video-player__play {
    position: relative;
    width: 56px;
    height: 56px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: rgba(13, 13, 13, 0.8);
    color: var(--muted-color);
    transition:
      background ease 0.15s,
      transform ease 0.15s;
  }

  .video-player__play:hover {
    background: var(--brand-color);
    color: var(--on-brand-color);
    transform: scale(1.06);
  }

  .video-player__play svg {
    width: 24px;
  }

  .video-player__caption {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 10px;
    overflow: hidden;
    font-size: var(--small-font-size);
    color: var(--subtle-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .video-player__message {
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
    color: var(--subtle-color);
  }

  .video-player__link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--brand-color);
  }

  .video-player__link:hover {
    text-decoration: underline;
  }
</style>
