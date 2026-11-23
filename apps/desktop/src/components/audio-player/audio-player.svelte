<script lang="ts">
  import { clock } from "@/helpers/time";
  import { t } from "@/i18n";
  import { claimPlayback } from "@/services/exclusive-audio";

  let {
    source,
    caption,
    wanted = false,
    onrequest,
    onreveal,
  }: {
    source: string | null;
    caption: string;
    wanted?: boolean;
    onrequest?: () => void;
    onreveal?: () => void;
  } = $props();

  let audio = $state<HTMLAudioElement>();
  let playing = $state(false);
  let position = $state(0);
  let duration = $state(0);
  let volume = $state(1);
  let muted = $state(false);
  let failed = $state(false);

  $effect(() => {
    if (audio && source && wanted) {
      void audio.play().catch(() => undefined);
    }
  });

  function toggle() {
    if (!source) {
      onrequest?.();
    } else if (audio?.paused) {
      void audio.play().catch(() => undefined);
    } else {
      audio?.pause();
    }
  }

  function started() {
    claimPlayback(audio);
  }

  function sync() {
    if (audio) {
      playing = !audio.paused;
      position = audio.currentTime;
      volume = audio.volume;
      muted = audio.muted;
      duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    }
  }

  function seek(event: Event) {
    if (audio) {
      audio.currentTime = Number((event.currentTarget as HTMLInputElement).value);
    }
  }

  function changeVolume(event: Event) {
    if (audio) {
      audio.volume = Number((event.currentTarget as HTMLInputElement).value);
      audio.muted = audio.volume === 0;
    }
  }

  function toggleMute() {
    if (audio) {
      audio.muted = !audio.muted;
      if (!audio.muted && audio.volume === 0) {
        audio.volume = 0.5;
      }
    }
  }
</script>

<div class="audio-player">
  {#if failed}
    <div class="audio-player__message">
      <span>{t("chat.audioUnsupported")}</span>
      {#if onreveal}
        <button type="button" class="audio-player__link" onclick={onreveal}>{t("chat.openFolder")}</button>
      {/if}
    </div>
  {:else}
    {#if source}
      <audio
        bind:this={audio}
        src={source}
        preload="metadata"
        onplay={() => {
          started();
          sync();
        }}
        onpause={sync}
        onended={sync}
        ontimeupdate={sync}
        ondurationchange={sync}
        onloadedmetadata={sync}
        onvolumechange={sync}
        onerror={() => (failed = true)}
      ></audio>
    {/if}
    <button
      type="button"
      class="audio-player__control audio-player__control--play"
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
    <span class="audio-player__time">
      {#if caption}
        {caption}
      {:else}
        {source && duration ? clock(position) : "-:--"} / {source && duration ? clock(duration) : "-:--"}
      {/if}
    </span>
    <input
      class="audio-player__range audio-player__range--seek"
      type="range"
      min="0"
      max={duration || 0}
      step="0.1"
      value={position}
      disabled={!source || !duration}
      style:--fill="{duration ? (position / duration) * 100 : 0}%"
      aria-label={t("chat.play")}
      oninput={seek}
    />
    <div class="audio-player__volume">
      <button
        type="button"
        class="audio-player__control"
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
        class="audio-player__range audio-player__range--volume"
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
  {/if}
</div>

<style>
  .audio-player {
    padding: 6px 10px 6px 6px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.35);
    color: var(--muted-color);
  }

  .audio-player__control {
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

  .audio-player__control:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .audio-player__control--play {
    width: 32px;
    height: 32px;
  }

  .audio-player__control svg {
    width: 16px;
  }

  .audio-player__control--play svg {
    width: 18px;
  }

  .audio-player__time {
    min-width: 72px;
    flex: none;
    font-size: var(--small-font-size);
    font-variant-numeric: tabular-nums;
  }

  .audio-player__range {
    --fill: 0%;
    height: 16px;
    margin: 0;
    appearance: none;
    background: transparent;
    cursor: pointer;
  }

  .audio-player__range:disabled {
    cursor: default;
  }

  .audio-player__range--seek {
    min-width: 0;
    flex-grow: 1;
  }

  .audio-player__range::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--brand-color) var(--fill), rgba(255, 255, 255, 0.25) var(--fill));
  }

  .audio-player__range::-webkit-slider-thumb {
    width: 12px;
    height: 12px;
    margin-top: -4px;
    appearance: none;
    border-radius: 50%;
    background: var(--muted-color);
  }

  .audio-player__range:disabled::-webkit-slider-thumb {
    opacity: 0;
  }

  .audio-player__volume {
    display: flex;
    align-items: center;
  }

  .audio-player__range--volume {
    width: 0;
    opacity: 0;
    transition:
      width ease 0.15s,
      opacity ease 0.15s;
  }

  .audio-player__volume:hover .audio-player__range--volume,
  .audio-player__range--volume:focus-visible {
    width: 64px;
    margin-left: 4px;
    opacity: 1;
  }

  .audio-player__message {
    padding: 4px 6px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .audio-player__link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--brand-color);
    font-size: var(--small-font-size);
    text-decoration: underline;
  }
</style>
