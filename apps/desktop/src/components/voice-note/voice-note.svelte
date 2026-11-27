<script lang="ts">
  import FolderButton from "@/components/folder-button/folder-button.svelte";
  import { clock } from "@/helpers/time";
  import { t } from "@/i18n";
  import { claimPlayback } from "@/services/exclusive-audio";

  let {
    source,
    seconds,
    seed,
    caption,
    wanted = false,
    disabled = false,
    onrequest,
    onfolder = null,
  }: {
    source: string | null;
    seconds: number | null;
    seed: string;
    caption: string;
    wanted?: boolean;
    disabled?: boolean;
    onrequest?: () => void;
    onfolder?: (() => void) | null;
  } = $props();

  const bars = 26;
  const speeds = [1, 1.5, 2];

  let audio = $state<HTMLAudioElement>();
  let playing = $state(false);
  let position = $state(0);
  let measured = $state(0);
  let muted = $state(false);
  let volume = $state(1);
  let speed = $state(0);
  let failed = $state(false);

  $effect(() => {
    void source;
    failed = false;
  });

  const total = $derived(seconds ?? measured);
  const progress = $derived(total > 0 ? Math.min(1, position / total) : 0);
  const heights = $derived(shape(seed));

  $effect(() => {
    if (audio && source && wanted) {
      void audio.play().catch(() => undefined);
    }
  });

  $effect(() => {
    if (audio) {
      audio.volume = volume;
    }
  });

  function shape(text: string): number[] {
    let state = 2166136261;
    for (const char of text) {
      state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
    }
    return Array.from({ length: bars }, (_, index) => {
      state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0;
      const wave = 0.55 + 0.45 * Math.sin((index / bars) * Math.PI * 2.6 + (state % 7));
      return Math.round(6 + wave * (8 + (state % 17)));
    });
  }

  function toggle() {
    if (disabled) {
      return;
    }
    if (!source) {
      onrequest?.();
    } else if (audio?.paused) {
      void audio.play().catch(() => undefined);
    } else {
      audio?.pause();
    }
  }

  function sync() {
    if (audio) {
      playing = !audio.paused;
      position = audio.currentTime;
      muted = audio.muted;
      measured = Number.isFinite(audio.duration) ? audio.duration : 0;
    }
  }

  function seek(event: Event) {
    if (audio && total > 0) {
      audio.currentTime = (Number((event.currentTarget as HTMLInputElement).value) / 100) * total;
    }
  }

  function cycle() {
    speed = (speed + 1) % speeds.length;
    if (audio) {
      audio.playbackRate = speeds[speed];
    }
  }

  function changeVolume(event: Event) {
    volume = Number((event.currentTarget as HTMLInputElement).value);
    if (audio) {
      audio.volume = volume;
      audio.muted = volume === 0;
    }
  }

  function toggleMute() {
    if (audio) {
      audio.muted = !audio.muted;
      if (!audio.muted && volume === 0) {
        volume = 0.5;
      }
    }
  }
</script>

<div class="voice-note">
  {#if source && !failed}
    <audio
      bind:this={audio}
      src={source}
      preload="metadata"
      onplay={() => {
        claimPlayback(audio);
        if (audio) {
          audio.playbackRate = speeds[speed];
        }
        sync();
      }}
      onpause={sync}
      onended={() => {
        playing = false;
        position = 0;
      }}
      ontimeupdate={sync}
      onloadedmetadata={sync}
      onvolumechange={sync}
      onerror={() => (failed = true)}
    ></audio>
  {/if}
  <button
    type="button"
    class="voice-note__play"
    aria-label={playing ? t("chat.pause") : t("chat.play")}
    {disabled}
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
  <div class="voice-note__wave">
    {#if failed}
      <span class="voice-note__caption">{t("chat.audioUnsupported")}</span>
    {:else if caption}
      <span class="voice-note__caption">{caption}</span>
    {:else}
      {#each heights as height, index (index)}
        <span
          class="voice-note__bar"
          class:voice-note__bar--played={progress > 0 && (index + 0.5) / bars <= progress}
          style:height="{height}px"
        ></span>
      {/each}
      <input
        class="voice-note__seek"
        type="range"
        min="0"
        max="100"
        step="1"
        value={progress * 100}
        disabled={!source || total === 0}
        aria-label={t("chat.voiceMessage")}
        oninput={seek}
      />
    {/if}
  </div>
  <span class="voice-note__time">{clock(playing || position > 0 ? position : total)}</span>
  <button
    type="button"
    class="voice-note__speed"
    aria-label={t("chat.playbackSpeed")}
    data-tooltip={t("chat.playbackSpeed")}
    onclick={cycle}
  >
    {speeds[speed]}X
  </button>
  {#if onfolder}
    <FolderButton variant="compact" onclick={onfolder} />
  {/if}
  <div class="voice-note__volume">
    <button
      type="button"
      class="voice-note__mute"
      aria-label={muted || volume === 0 ? t("chat.unmute") : t("chat.mute")}
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
      class="voice-note__range"
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={muted ? 0 : volume}
      style:--fill="{(muted ? 0 : volume) * 100}%"
      disabled={!source}
      aria-label={t("chat.volume")}
      oninput={changeVolume}
    />
  </div>
</div>

<style>
  .voice-note {
    width: 320px;
    max-width: 100%;
    margin: 4px 0;
    padding: 8px 12px 8px 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-radius: 28px;
    background: var(--surface-color);
    color: var(--muted-color);
  }

  .voice-note__play {
    width: 40px;
    height: 40px;
    flex: none;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: var(--brand-color);
    color: var(--on-brand-color);
    transition: transform ease 0.15s;
  }

  .voice-note__play:not(:disabled):hover {
    transform: scale(1.06);
  }

  .voice-note__play:disabled {
    background: var(--active-color);
    color: var(--subtle-color);
  }

  .voice-note__play svg {
    width: 18px;
  }

  .voice-note__wave {
    position: relative;
    min-width: 0;
    height: 32px;
    flex-grow: 1;
    display: flex;
    align-items: center;
    gap: 3px;
    overflow: hidden;
  }

  .voice-note__bar {
    width: 3px;
    flex: none;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.35);
  }

  .voice-note__bar--played {
    background: var(--brand-color);
  }

  .voice-note__caption {
    overflow: hidden;
    font-size: var(--small-font-size);
    color: var(--subtle-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .voice-note__seek {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .voice-note__seek:disabled {
    cursor: default;
  }

  .voice-note__time {
    min-width: 32px;
    flex: none;
    font-size: var(--small-font-size);
    font-variant-numeric: tabular-nums;
  }

  .voice-note__speed {
    height: 24px;
    flex: none;
    padding: 0 8px;
    border: 0;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.1);
    color: var(--muted-color);
    font-size: 11px;
    font-weight: 700;
  }

  .voice-note__speed:hover {
    background: rgba(255, 255, 255, 0.18);
  }

  .voice-note__volume {
    flex: none;
    display: flex;
    align-items: center;
  }

  .voice-note__mute {
    width: 28px;
    height: 28px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted-color);
  }

  .voice-note__mute:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .voice-note__mute svg {
    width: 16px;
  }

  .voice-note__range {
    --fill: 0%;
    width: 0;
    height: 16px;
    margin: 0;
    appearance: none;
    background: transparent;
    cursor: pointer;
    opacity: 0;
    transition:
      width ease 0.15s,
      opacity ease 0.15s;
  }

  .voice-note__volume:hover .voice-note__range:not(:disabled),
  .voice-note__range:focus-visible {
    width: 64px;
    margin-left: 4px;
    opacity: 1;
  }

  .voice-note__range:disabled {
    cursor: default;
  }

  .voice-note__range::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--brand-color) var(--fill), rgba(255, 255, 255, 0.25) var(--fill));
  }

  .voice-note__range::-webkit-slider-thumb {
    width: 12px;
    height: 12px;
    margin-top: -4px;
    appearance: none;
    border-radius: 50%;
    background: var(--muted-color);
  }
</style>
