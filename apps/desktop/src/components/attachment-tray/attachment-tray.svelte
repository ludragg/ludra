<script lang="ts">
  import { convertFileSrc, invoke } from "@tauri-apps/api/core";
  import { mimeFor, playableTypes, viewableTypes, type Picked } from "@/helpers/files";
  import { t } from "@/i18n";

  let {
    items,
    squared = false,
    onremove,
  }: { items: Picked[]; squared?: boolean; onremove: (path: string) => void } = $props();

  let previews = $state<Record<string, string>>({});

  $effect(() => {
    for (const item of items) {
      const mime = mimeFor(item.name);
      if (item.path in previews || !(viewableTypes.has(mime) || playableTypes.has(mime))) {
        continue;
      }
      previews[item.path] = "";
      void invoke<string | null>("stage_preview", { path: item.path })
        .then((allowed) => {
          if (allowed) {
            previews[item.path] = convertFileSrc(allowed);
          }
        })
        .catch(() => undefined);
    }
  });
</script>

<div class="attachment-tray" class:attachment-tray--squared={squared} role="list" aria-label={t("chat.files")}>
  {#each items as item (item.path)}
    {@const mime = mimeFor(item.name)}
    <div class="attachment-tray__item" role="listitem">
      <div class="attachment-tray__thumb">
        {#if previews[item.path] && viewableTypes.has(mime)}
          <img class="attachment-tray__media" src={previews[item.path]} alt="" draggable="false" />
        {:else if previews[item.path] && playableTypes.has(mime)}
          <video class="attachment-tray__media" src="{previews[item.path]}#t=0.1" preload="metadata" muted></video>
        {:else}
          <svg
            class="attachment-tray__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5" />
          </svg>
        {/if}
        <span class="attachment-tray__tools">
          <button
            type="button"
            class="attachment-tray__remove"
            aria-label={t("chat.removeAttachment")}
            data-tooltip={t("chat.removeAttachment")}
            onclick={() => onremove(item.path)}
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
        </span>
      </div>
      <span class="attachment-tray__name" data-tooltip={item.name}>{item.name}</span>
    </div>
  {/each}
</div>

<style>
  .attachment-tray {
    margin-bottom: -6px;
    padding: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    border: 1px solid var(--border-color);
    border-bottom: 0;
    border-radius: 8px 8px 0 0;
    background: var(--dark-background-color);
  }

  .attachment-tray--squared {
    border-radius: 0;
  }

  .attachment-tray__item {
    width: 112px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .attachment-tray__thumb {
    position: relative;
    width: 112px;
    height: 112px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--surface-color);
    color: var(--subtle-color);
  }

  .attachment-tray__media {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .attachment-tray__icon {
    width: 32px;
  }

  .attachment-tray__tools {
    position: absolute;
    top: 4px;
    right: 4px;
    padding: 2px;
    display: none;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--dark-background-color);
  }

  .attachment-tray__thumb:hover .attachment-tray__tools,
  .attachment-tray__thumb:focus-within .attachment-tray__tools {
    display: flex;
  }

  .attachment-tray__remove {
    width: 26px;
    height: 26px;
    padding: 4px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--error-color);
  }

  .attachment-tray__remove:hover {
    background: var(--active-color);
  }

  .attachment-tray__name {
    overflow: hidden;
    font-size: var(--small-font-size);
    color: var(--body-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
