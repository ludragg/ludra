<script lang="ts">
  import { isTauri } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import type { Picked } from "@/helpers/files";
  import { t } from "@/i18n";
  import { chat } from "@/stores/chat.svelte";

  let { target }: { target: string | null } = $props();

  let dragging = $state(false);

  $effect(() => {
    if (!isTauri()) {
      return;
    }
    const stops = [
      getCurrentWebview().onDragDropEvent(({ payload }) => {
        dragging = payload.type === "enter" || payload.type === "over";
      }),
      listen<Picked[]>("files-dropped", ({ payload }) => {
        dragging = false;
        if (target) {
          void chat.sendFiles(payload);
        }
      }),
    ];
    return () => {
      for (const stop of stops) {
        void stop.then((unlisten) => unlisten());
      }
    };
  });
</script>

{#if dragging && target}
  <div class="drop-zone" role="presentation">
    <div class="drop-zone__box">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M5 20h14" />
      </svg>
      <span class="drop-zone__title">{t("chat.dropToSend", { name: target })}</span>
    </div>
  </div>
{/if}

<style>
  .drop-zone {
    position: absolute;
    inset: 0;
    z-index: 40;
    padding: var(--page-gutter);
    display: grid;
    background: rgba(13, 13, 13, 0.75);
    pointer-events: none;
    animation: appear 0.12s ease;
  }

  .drop-zone__box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    border: 2px dashed color-mix(in srgb, var(--brand-color) 70%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--brand-color) 8%, transparent);
    color: var(--brand-color);
  }

  .drop-zone__box svg {
    width: 40px;
  }

  .drop-zone__title {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 600;
    color: var(--muted-color);
  }

  @keyframes appear {
    from {
      opacity: 0;
    }
  }
</style>
