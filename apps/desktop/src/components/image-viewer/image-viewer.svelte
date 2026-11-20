<script lang="ts">
  import { tick } from "svelte";
  import { t } from "@/i18n";

  let {
    load,
    label,
    save,
    onclose,
  }: {
    load: () => Promise<string>;
    label: string;
    save?: () => Promise<string | null>;
    onclose: () => void;
  } = $props();

  let url = $state("");
  let natural = $state(0);
  let zoomed = $state(false);
  let saved = $state<"idle" | "saving" | "saved" | "failed">("idle");
  let stage = $state<HTMLElement>();
  let drag: { x: number; y: number; left: number; top: number; moved: boolean } | null = null;

  const zoomWidth = $derived(natural >= 1200 ? natural : natural * 2);
  const downloadLabel = $derived(
    saved === "saved" ? t("chat.downloaded") : saved === "failed" ? t("chat.downloadFailed") : t("chat.download"),
  );

  $effect(() => {
    load()
      .then((value) => (url = value))
      .catch(() => undefined);
  });

  async function zoom(next: boolean) {
    zoomed = next;
    await tick();
    if (next && stage) {
      stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2;
      stage.scrollTop = (stage.scrollHeight - stage.clientHeight) / 2;
    }
  }

  async function download() {
    if (saved === "saving" || !save) {
      return;
    }
    saved = "saving";
    try {
      const path = await save();
      saved = path ? "saved" : "idle";
    } catch {
      saved = "failed";
    }
    if (saved !== "idle") {
      window.setTimeout(() => (saved = "idle"), 2500);
    }
  }

  function keydown(event: KeyboardEvent) {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (zoomed) {
      void zoom(false);
    } else {
      onclose();
    }
  }

  function backdrop(event: MouseEvent) {
    if (event.target === event.currentTarget && !zoomed) {
      onclose();
    }
  }

  function pointerdown(event: PointerEvent) {
    if (!zoomed || !stage || event.button !== 0) {
      return;
    }
    drag = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function pointermove(event: PointerEvent) {
    if (!drag || !stage) {
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.moved ||= Math.abs(dx) + Math.abs(dy) > 4;
    stage.scrollLeft = drag.left - dx;
    stage.scrollTop = drag.top - dy;
  }

  function pointerup() {
    const clicked = drag && !drag.moved;
    drag = null;
    if (clicked) {
      void zoom(false);
    }
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="image-viewer" role="dialog" aria-modal="true" aria-label={label}>
  <div
    class="image-viewer__stage"
    class:image-viewer__stage--zoomed={zoomed}
    role="presentation"
    bind:this={stage}
    onclick={backdrop}
  >
    {#if url}
      {#if zoomed}
        <img
          class="image-viewer__image image-viewer__image--zoomed"
          src={url}
          alt={label}
          draggable="false"
          style:width="{zoomWidth}px"
          onpointerdown={pointerdown}
          onpointermove={pointermove}
          onpointerup={pointerup}
        />
      {:else}
        <button type="button" class="image-viewer__fit" aria-label={t("chat.zoomIn")} onclick={() => zoom(true)}>
          <img
            class="image-viewer__image"
            src={url}
            alt={label}
            draggable="false"
            onload={(event) => (natural = (event.currentTarget as HTMLImageElement).naturalWidth)}
          />
        </button>
      {/if}
    {/if}
  </div>

  {#if zoomed}
    <button
      type="button"
      class="image-viewer__close image-viewer__close--floating"
      aria-label={t("chat.zoomOut")}
      data-tooltip={t("chat.zoomOut")}
      onclick={() => zoom(false)}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  {:else}
    <div class="image-viewer__toolbar">
      <div class="image-viewer__tools">
        <button
          type="button"
          class="image-viewer__tool"
          aria-label={t("chat.zoomIn")}
          data-tooltip={t("chat.zoomIn")}
          onclick={() => zoom(true)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5M11 8v6M8 11h6" />
          </svg>
        </button>
        {#if save}
          <button
            type="button"
            class="image-viewer__tool"
            disabled={saved === "saving"}
            class:image-viewer__tool--done={saved === "saved"}
            aria-label={downloadLabel}
            data-tooltip={downloadLabel}
            onclick={download}
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
              {#if saved === "saved"}
                <path d="M5 12l5 5L20 7" />
              {:else}
                <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
              {/if}
            </svg>
          </button>
        {/if}
      </div>
      <button
        type="button"
        class="image-viewer__close"
        aria-label={t("chat.closePhoto")}
        data-tooltip={t("chat.closePhoto")}
        onclick={onclose}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  {/if}
</div>

<style>
  .image-viewer {
    position: fixed;
    inset: 32px 0 0;
    z-index: 50;
    background: rgba(0, 0, 0, 0.88);
    animation: fade 0.15s ease;
  }

  .image-viewer__stage {
    width: 100%;
    height: 100%;
    padding: 72px 48px 48px;
    display: flex;
    overflow: auto;
  }

  .image-viewer__stage--zoomed {
    padding: 0;
    overflow: hidden;
  }

  .image-viewer__fit {
    max-width: 100%;
    max-height: 100%;
    margin: auto;
    padding: 0;
    display: flex;
    border: 0;
    background: transparent;
    cursor: zoom-in;
  }

  .image-viewer__image {
    max-width: 100%;
    max-height: calc(100vh - 32px - 120px);
    display: block;
    border-radius: 8px;
    object-fit: contain;
    user-select: none;
  }

  .image-viewer__image--zoomed {
    max-width: none;
    max-height: none;
    margin: auto;
    flex: none;
    border-radius: 0;
    cursor: zoom-out;
  }

  .image-viewer__toolbar {
    position: absolute;
    top: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .image-viewer__tools {
    padding: 2px;
    display: flex;
    gap: 2px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--dark-background-color);
  }

  .image-viewer__tool {
    width: 36px;
    height: 36px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--body-color);
    transition:
      background ease 0.15s,
      color ease 0.15s;
  }

  .image-viewer__tool:disabled {
    opacity: var(--disabled-opacity);
  }

  .image-viewer__tool:not(:disabled):hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .image-viewer__tool--done {
    color: var(--success-color);
  }

  .image-viewer__tool svg {
    width: 18px;
  }

  .image-viewer__close {
    width: 40px;
    height: 40px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 1px solid var(--border-color);
    border-radius: 50%;
    background: var(--dark-background-color);
    color: var(--body-color);
    transition:
      background ease 0.15s,
      color ease 0.15s;
  }

  .image-viewer__close:hover {
    background: #1a1a1a;
    color: var(--muted-color);
  }

  .image-viewer__close svg {
    width: 16px;
  }

  .image-viewer__close--floating {
    position: absolute;
    top: 16px;
    right: 16px;
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
