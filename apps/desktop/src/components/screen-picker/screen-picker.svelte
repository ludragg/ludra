<script lang="ts">
  import { untrack } from "svelte";
  import Select from "@/components/select/select.svelte";
  import { encoderOptions } from "@/helpers/encoder-options";
  import { t } from "@/i18n";
  import { listScreenSources, type ScreenSource } from "@/services/native-screen";
  import {
    allowedFrameRate,
    allowedMode,
    allowedResolution,
    frameRateLocked,
    frameRates,
    modeLocked,
    resolutionLocked,
    resolutions,
    shareEncoders,
    shareModes,
    type FrameRate,
    type Resolution,
    type ScreenQuality,
    type ShareEncoder,
    type ShareMode,
  } from "@/services/screen";
  import { hardwareEncoders, type DetectedEncoder } from "@/services/stream-encoders";
  import { preferences } from "@/stores/preferences.svelte";

  type Tab = "screen" | "window";

  type Current = { sourceId: string; quality: ScreenQuality };

  let {
    current = null,
    onshare,
    onstop,
    onclose,
  }: {
    current?: Current | null;
    onshare: (sourceId: string, quality: ScreenQuality) => void;
    onstop?: () => void;
    onclose: () => void;
  } = $props();

  const initial = untrack(() => current);

  let tab = $state<Tab>("screen");
  let sources = $state<ScreenSource[] | null>(null);
  let selected = $state<string | null>(null);
  let resolution = $state<Resolution>(
    initial?.quality.resolution ?? pick(resolutions, preferences.values.shareResolution, 1080),
  );
  let fps = $state<FrameRate>(initial?.quality.fps ?? pick(frameRates, preferences.values.shareFps, 60));
  let mode = $state<ShareMode>(initial?.quality.mode ?? pick(shareModes, preferences.values.shareMode, "balanced"));
  let encoder = $state<ShareEncoder>(
    initial?.quality.encoder ?? pick(shareEncoders, preferences.values.shareEncoder, "auto"),
  );
  let detected = $state<DetectedEncoder[] | null>(null);
  let modeChosen = false;

  const encoders = $derived(encoderOptions(detected ?? []));
  const shownEncoder = $derived(encoders.some(({ value }) => value === encoder) ? encoder : "auto");
  const direct = $derived(preferences.values.directCalls);
  const shownResolution = $derived(allowedResolution(resolution, direct));
  const shownFps = $derived(allowedFrameRate(fps, direct));
  const shownMode = $derived(allowedMode(mode, direct));
  const modes = $derived(
    shareModes.map((value) => ({
      value,
      label: t(`screen.modes.${value}`),
      locked: modeLocked(value, direct) ? t("screen.directRequired") : undefined,
    })),
  );

  hardwareEncoders().then((list) => (detected = list));

  const visible = $derived((sources ?? []).filter(({ kind }) => kind === tab));

  const refreshEvery = 3000;
  let loading = false;

  function keepOrder(previous: ScreenSource[], next: ScreenSource[]): ScreenSource[] {
    const known = new Map(previous.map(({ id }, index) => [id, index]));
    const rank = (source: ScreenSource) => known.get(source.id) ?? previous.length + next.indexOf(source);
    return [...next].sort((a, b) => rank(a) - rank(b));
  }

  function load() {
    if (loading) {
      return;
    }
    loading = true;
    const first = sources === null;
    listScreenSources()
      .then((list) => {
        if (first) {
          sources = list;
          const live = list.find(({ id }) => id === initial?.sourceId);
          tab = live?.kind ?? "screen";
          selected = live?.id ?? list.find(({ kind }) => kind === "screen")?.id ?? null;
          return;
        }
        sources = keepOrder(sources ?? [], list);
        if (!list.some(({ id }) => id === selected)) {
          selected = list.find(({ kind }) => kind === "screen")?.id ?? null;
        }
      })
      .catch(() => {
        if (first) {
          sources = [];
        }
      })
      .finally(() => (loading = false));
  }

  $effect(() => {
    untrack(load);
    const timer = window.setInterval(load, refreshEvery);
    window.addEventListener("focus", load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  });

  function pick<T extends number | string>(options: readonly T[], value: number | string, fallback: T): T {
    return options.find((option) => option === value) ?? fallback;
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!selected) {
      return;
    }
    if (direct) {
      preferences.set("shareResolution", resolution);
      preferences.set("shareFps", fps);
    }
    if (direct || modeChosen) {
      preferences.set("shareMode", mode);
    }
    const chosen = detected ? shownEncoder : encoder;
    preferences.set("shareEncoder", chosen);
    const unchanged =
      initial?.sourceId === selected &&
      initial.quality.resolution === shownResolution &&
      initial.quality.fps === shownFps &&
      initial.quality.mode === shownMode &&
      initial.quality.encoder === chosen;
    if (!unchanged) {
      onshare(selected, { resolution: shownResolution, fps: shownFps, mode: shownMode, encoder: chosen });
    }
    onclose();
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onclose();
    }
  }

  function onpointerdown(event: PointerEvent) {
    if (event.target === event.currentTarget) {
      onclose();
    }
  }
</script>

<svelte:window {onkeydown} />

{#snippet lock()}
  <svg
    class="screen-picker__lock"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
{/snippet}

<div class="screen-picker" role="presentation" {onpointerdown}>
  <div class="screen-picker__card" role="dialog" aria-modal="true" aria-labelledby="screen-picker-title">
    <form class="screen-picker__form" onsubmit={submit}>
      <div class="screen-picker__header">
        <h2 id="screen-picker-title" class="screen-picker__title">
          {initial ? t("screen.options") : t("screen.title")}
        </h2>
        <div class="screen-picker__tabs" role="tablist">
          <button
            type="button"
            class="screen-picker__tab"
            class:screen-picker__tab--active={tab === "screen"}
            role="tab"
            aria-selected={tab === "screen"}
            onclick={() => (tab = "screen")}
          >
            {t("screen.screens")}
          </button>
          <button
            type="button"
            class="screen-picker__tab"
            class:screen-picker__tab--active={tab === "window"}
            role="tab"
            aria-selected={tab === "window"}
            onclick={() => (tab = "window")}
          >
            {t("screen.windows")}
          </button>
        </div>
      </div>

      <div class="screen-picker__sources" role="radiogroup" aria-label={t("screen.source")}>
        {#if sources === null}
          <p class="screen-picker__empty">{t("screen.loadingSources")}</p>
        {:else}
          {#each visible as source (source.id)}
            <button
              type="button"
              class="screen-picker__source"
              class:screen-picker__source--active={selected === source.id}
              role="radio"
              aria-checked={selected === source.id}
              data-tooltip={source.name}
              onclick={() => (selected = source.id)}
            >
              <span class="screen-picker__preview">
                {#if source.thumbnail}
                  <img class="screen-picker__thumbnail" src={source.thumbnail} alt="" />
                {/if}
                {#if source.id === initial?.sourceId}
                  <span class="screen-picker__live">{t("screen.live")}</span>
                {/if}
              </span>
              <span class="screen-picker__name">{source.name}</span>
            </button>
          {:else}
            <p class="screen-picker__empty">{t("screen.noSources")}</p>
          {/each}
        {/if}
      </div>

      <div class="screen-picker__quality">
        <div class="screen-picker__group">
          <span class="screen-picker__label" id="screen-resolution">{t("screen.resolution")}</span>
          <div class="screen-picker__options" role="radiogroup" aria-labelledby="screen-resolution">
            {#each resolutions as option (option)}
              {@const locked = resolutionLocked(option, direct)}
              <button
                type="button"
                class="screen-picker__option"
                class:screen-picker__option--active={shownResolution === option}
                role="radio"
                aria-checked={shownResolution === option}
                aria-disabled={locked}
                data-tooltip={locked ? t("screen.directRequired") : undefined}
                onclick={() => {
                  if (!locked) {
                    resolution = option;
                  }
                }}
              >
                {#if locked}
                  {@render lock()}
                {/if}
                {option}p
              </button>
            {/each}
          </div>
        </div>
        <div class="screen-picker__group">
          <span class="screen-picker__label" id="screen-fps">{t("screen.fps")}</span>
          <div class="screen-picker__options" role="radiogroup" aria-labelledby="screen-fps">
            {#each frameRates as option (option)}
              {@const locked = frameRateLocked(option, direct)}
              <button
                type="button"
                class="screen-picker__option"
                class:screen-picker__option--active={shownFps === option}
                role="radio"
                aria-checked={shownFps === option}
                aria-disabled={locked}
                data-tooltip={locked ? t("screen.directRequired") : undefined}
                onclick={() => {
                  if (!locked) {
                    fps = option;
                  }
                }}
              >
                {#if locked}
                  {@render lock()}
                {/if}
                {t("screen.fpsValue", { fps: option })}
              </button>
            {/each}
          </div>
        </div>
      </div>

      <div class="screen-picker__quality">
        <Select
          id="screen-encoder"
          label={t("screen.encoder")}
          options={encoders}
          value={shownEncoder}
          compact
          onchange={(value) => (encoder = value)}
        />
        <Select
          id="screen-mode"
          label={t("screen.mode")}
          options={modes}
          value={shownMode}
          compact
          onchange={(value) => {
            mode = value;
            modeChosen = true;
          }}
        />
      </div>

      <div class="screen-picker__actions">
        {#if initial && onstop}
          <button
            type="button"
            class="screen-picker__button screen-picker__button--danger"
            onclick={() => {
              onstop();
              onclose();
            }}
          >
            {t("screen.stop")}
          </button>
        {/if}
        <button type="button" class="screen-picker__button" onclick={onclose}>{t("screen.cancel")}</button>
        <button type="submit" class="screen-picker__button screen-picker__button--primary" disabled={!selected}>
          {initial ? t("screen.update") : t("screen.start")}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .screen-picker {
    position: fixed;
    inset: 32px 0 0;
    z-index: 20;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.6);
  }

  .screen-picker__card {
    width: min(720px, calc(100vw - 48px));
    max-height: calc(100vh - 80px);
    display: flex;
    border-radius: 12px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
  }

  .screen-picker__form {
    min-height: 0;
    width: 100%;
    padding: 20px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .screen-picker__header {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .screen-picker__title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 600;
    color: var(--muted-color);
  }

  .screen-picker__tabs {
    display: flex;
    gap: 16px;
  }

  .screen-picker__tab {
    padding: 4px 0;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--subtle-color);
    font-size: var(--small-font-size);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    transition: color ease 0.1s;
  }

  .screen-picker__tab:hover {
    color: var(--muted-color);
  }

  .screen-picker__tab--active {
    color: var(--muted-color);
    border-bottom-color: var(--brand-color);
  }

  .screen-picker__sources {
    min-height: 160px;
    max-height: 340px;
    padding: 2px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    align-content: start;
    gap: 12px;
    overflow-y: auto;
  }

  .screen-picker__empty {
    grid-column: 1 / -1;
    margin: auto;
    padding: 48px 0;
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  .screen-picker__source {
    min-width: 0;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 2px solid transparent;
    border-radius: 8px;
    background: var(--surface-color);
    color: var(--body-color);
    text-align: left;
    transition: all ease 0.1s;
  }

  .screen-picker__source:hover {
    background: var(--hover-color);
  }

  .screen-picker__source--active,
  .screen-picker__source--active:hover {
    border-color: var(--brand-color);
    color: var(--muted-color);
  }

  .screen-picker__preview {
    position: relative;
    aspect-ratio: 16 / 9;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 4px;
    background: #000000;
  }

  .screen-picker__thumbnail {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .screen-picker__live {
    position: absolute;
    top: 6px;
    left: 6px;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--error-color);
    color: #ffffff;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .screen-picker__name {
    padding: 0 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--hint-font-size);
    font-weight: 600;
  }

  .screen-picker__quality {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .screen-picker__group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .screen-picker__label {
    font-size: var(--small-font-size);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--subtle-color);
  }

  .screen-picker__options {
    display: flex;
    gap: 6px;
  }

  .screen-picker__option {
    height: 32px;
    padding: 0;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: transparent;
    color: var(--body-color);
    font-size: var(--hint-font-size);
    font-weight: 600;
    transition: all ease 0.1s;
  }

  .screen-picker__option:hover {
    background: var(--hover-color);
  }

  .screen-picker__option--active,
  .screen-picker__option--active:hover {
    border-color: var(--brand-color);
    background: var(--brand-color);
    color: var(--on-brand-color);
  }

  .screen-picker__option[aria-disabled="true"],
  .screen-picker__option[aria-disabled="true"]:hover {
    background: transparent;
    color: var(--subtle-color);
    opacity: 0.7;
    cursor: default;
  }

  .screen-picker__lock {
    width: 12px;
    height: 12px;
    flex: none;
  }

  .screen-picker__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .screen-picker__button {
    height: 36px;
    padding: 0 14px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: transparent;
    color: var(--muted-color);
    font-size: var(--hint-font-size);
    font-weight: 600;
  }

  .screen-picker__button--danger {
    margin-right: auto;
    border-color: transparent;
    background: var(--danger-color);
  }

  .screen-picker__button--primary {
    border-color: var(--muted-color);
    background: var(--muted-color);
    color: var(--on-brand-color);
  }

  .screen-picker__button--primary:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
