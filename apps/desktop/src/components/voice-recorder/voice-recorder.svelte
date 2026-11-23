<script lang="ts">
  import { clock } from "@/helpers/time";
  import { t } from "@/i18n";
  import { levelPercent } from "@/services/microphone";
  import { maxRecordingSeconds, VoiceRecorder, type Recording } from "@/services/voice-recorder";

  let {
    replying = false,
    onsend,
    oncancel,
    onerror,
  }: {
    replying?: boolean;
    onsend: (recording: Recording) => void;
    oncancel: () => void;
    onerror: () => void;
  } = $props();

  const barWidth = 3;
  const barGap = 3;
  const sampleEvery = 50;

  let phase = $state<"starting" | "recording" | "review">("starting");
  let canvas = $state<HTMLCanvasElement>();
  let player = $state<HTMLAudioElement>();
  let seconds = $state(0);
  let recording = $state<Recording | null>(null);
  let source = $state("");
  let playing = $state(false);
  let position = $state(0);
  let finishing = false;

  const levels: number[] = [];
  let recorder: VoiceRecorder | null = null;
  let timer = 0;

  $effect(() => {
    let alive = true;
    VoiceRecorder.start()
      .then((started) => {
        if (!alive) {
          started.cancel();
          return;
        }
        recorder = started;
        phase = "recording";
        timer = window.setInterval(sample, sampleEvery);
      })
      .catch(() => {
        onerror();
        oncancel();
      });
    return () => {
      alive = false;
      window.clearInterval(timer);
      recorder?.cancel();
      if (source) {
        URL.revokeObjectURL(source);
      }
    };
  });

  $effect(() => {
    if (!canvas) {
      return;
    }
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  });

  $effect(() => {
    void position;
    void phase;
    draw();
  });

  function sample() {
    if (!recorder) {
      return;
    }
    levels.push(levelPercent(recorder.level()) / 100);
    seconds = recorder.elapsed;
    draw();
    if (seconds >= maxRecordingSeconds) {
      void stop();
    }
  }

  async function stop() {
    if (!recorder || phase !== "recording") {
      return;
    }
    window.clearInterval(timer);
    recording = await recorder.stop();
    seconds = recording.seconds;
    source = URL.createObjectURL(recording.blob);
    phase = "review";
  }

  async function send() {
    if (finishing) {
      return;
    }
    finishing = true;
    await stop();
    if (recording) {
      onsend(recording);
    }
  }

  function toggle() {
    if (phase === "recording") {
      void stop();
    } else if (player?.paused) {
      void player.play().catch(() => undefined);
    } else {
      player?.pause();
    }
  }

  function draw() {
    if (!canvas) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const context = canvas.getContext("2d");
    if (!context || width === 0) {
      return;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const style = getComputedStyle(canvas);
    const bar = style.getPropertyValue("--muted-color").trim() || "#f0f1f7";
    const dim = style.getPropertyValue("--subtle-color").trim() || "#8e919b";
    const played = style.getPropertyValue("--brand-color").trim() || "#c77dff";

    const slots = Math.max(1, Math.floor((width + barGap) / (barWidth + barGap)));
    const reviewing = phase === "review";
    const values = reviewing ? condensed(slots) : levels.slice(-slots);
    const offset = reviewing ? 0 : slots - values.length;
    const progress = reviewing && seconds > 0 ? position / seconds : 0;

    for (let slot = 0; slot < slots; slot++) {
      const x = slot * (barWidth + barGap);
      const value = values[slot - offset];
      if (value === undefined) {
        context.fillStyle = dim;
        context.fillRect(x, height / 2 - 1, barWidth, 2);
        continue;
      }
      const size = Math.max(4, value * height * 0.9);
      context.fillStyle = reviewing && slot / slots <= progress && progress > 0 ? played : bar;
      context.beginPath();
      context.roundRect(x, (height - size) / 2, barWidth, size, 1.5);
      context.fill();
    }
  }

  function condensed(slots: number): number[] {
    if (levels.length <= slots) {
      return levels;
    }
    return Array.from({ length: slots }, (_, slot) => {
      const from = Math.floor((slot * levels.length) / slots);
      const to = Math.max(from + 1, Math.floor(((slot + 1) * levels.length) / slots));
      const part = levels.slice(from, to);
      return part.reduce((sum, value) => sum + value, 0) / part.length;
    });
  }
</script>

<div class="voice-recorder" class:voice-recorder--replying={replying} role="group" aria-label={t("chat.voiceMessage")}>
  <button
    type="button"
    class="voice-recorder__button"
    aria-label={phase === "recording" ? t("chat.stopRecording") : playing ? t("chat.pause") : t("chat.play")}
    disabled={phase === "starting"}
    onclick={toggle}
  >
    {#if phase === "review"}
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        {#if playing}
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        {:else}
          <path d="M8 6.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 8 6.5z" />
        {/if}
      </svg>
    {:else}
      <span class="voice-recorder__stop"></span>
    {/if}
  </button>
  <canvas class="voice-recorder__wave" bind:this={canvas}></canvas>
  <span class="voice-recorder__time">
    {#if phase === "recording"}<span class="voice-recorder__dot"></span>{/if}
    {clock(phase === "review" && playing ? position : seconds)}
  </span>
  <span class="voice-recorder__divider"></span>
  <button
    type="button"
    class="voice-recorder__button"
    aria-label={t("chat.discardRecording")}
    data-tooltip={t("chat.discardRecording")}
    onclick={oncancel}
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
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  </button>
  <button
    type="button"
    class="voice-recorder__button voice-recorder__button--send"
    aria-label={t("chat.sendRecording")}
    data-tooltip={t("chat.sendRecording")}
    disabled={phase === "starting"}
    onclick={send}
  >
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.993.993 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"
      />
    </svg>
  </button>
  {#if source}
    <audio
      bind:this={player}
      src={source}
      onplay={() => (playing = true)}
      onpause={() => (playing = false)}
      onended={() => {
        playing = false;
        position = 0;
      }}
      ontimeupdate={() => (position = player?.currentTime ?? 0)}
    ></audio>
  {/if}
</div>

<style>
  .voice-recorder {
    padding: 4px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-radius: 8px;
    background: var(--dark-background-color);
    border: 1px solid var(--border-color);
  }

  .voice-recorder--replying {
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }

  .voice-recorder__button {
    width: 36px;
    height: 36px;
    flex: none;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--subtle-color);
    transition:
      background ease 0.15s,
      color ease 0.15s;
  }

  .voice-recorder__button:not(:disabled):hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .voice-recorder__button svg {
    width: 20px;
  }

  .voice-recorder__button--send {
    color: var(--brand-color);
  }

  .voice-recorder__stop {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    background: currentColor;
  }

  .voice-recorder__wave {
    min-width: 0;
    height: 32px;
    flex-grow: 1;
  }

  .voice-recorder__time {
    min-width: 44px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    font-variant-numeric: tabular-nums;
    color: var(--muted-color);
  }

  .voice-recorder__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--error-color);
  }

  .voice-recorder__divider {
    width: 1px;
    height: 20px;
    flex: none;
    background: var(--border-color);
  }
</style>
