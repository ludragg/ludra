<script lang="ts">
  import { convertFileSrc } from "@tauri-apps/api/core";
  import CensorCover from "@/components/censor-cover/censor-cover.svelte";
  import FolderButton from "@/components/folder-button/folder-button.svelte";
  import MediaCarousel from "@/components/media-carousel/media-carousel.svelte";
  import { playableTypes } from "@/helpers/files";
  import { copyMenu } from "@/helpers/image-menu";
  import { Thumbnail } from "@/helpers/rendition.svelte";
  import { t } from "@/i18n";
  import type { Message } from "@/protocol/ludra/v1/models_pb";
  import { files } from "@/stores/files.svelte";

  let { items, mine }: { items: Message[]; mine: boolean } = $props();

  let local = $state<string | null>(null);
  let opened = $state<number | null>(null);
  let uncensored = $state<string | null>(null);

  const first = $derived(items[0]);
  const video = $derived(playableTypes.has(first.file!.mime));
  const source = $derived(local ? convertFileSrc(local) : null);
  const thumbnail = new Thumbnail(() => (video ? null : local));
  const censored = $derived(first.file!.censored && uncensored !== first.id);
  const covered = $derived(censored && (video ? source : thumbnail.url) !== null);

  $effect(() => {
    const id = first.id;
    void files.transfers[id]?.state;
    void files.mediaPath(first).then((path) => {
      if (id === first.id) {
        local = path;
      }
    });
  });

  async function openFolder() {
    local = await files.openFolder(first);
  }
</script>

<div class="media-gallery">
  <div class="media-gallery__frame">
    <button type="button" class="media-gallery__main" aria-label={t("chat.openGallery")} onclick={() => (opened = 0)}>
      {#if source && video}
        <video
          class="media-gallery__media"
          class:media-gallery__media--blurred={censored}
          src="{source}#t=0.1"
          preload="metadata"
          muted
        ></video>
        {#if !censored}
          <span class="media-gallery__play">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 6.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 8 6.5z" />
            </svg>
          </span>
        {/if}
      {:else if thumbnail.url}
        <img
          class="media-gallery__media"
          class:media-gallery__media--blurred={censored}
          src={thumbnail.url}
          alt={censored ? "" : first.file!.name}
          draggable="false"
          {@attach copyMenu(() => (censored ? null : source))}
        />
      {:else}
        <svg
          class="media-gallery__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        </svg>
      {/if}
    </button>
    {#if local}
      <span class="media-gallery__folder">
        <FolderButton variant="overlay" onclick={() => void openFolder()} />
      </span>
    {/if}
    {#if covered}
      <CensorCover onuncensor={() => (uncensored = first.id)} />
    {/if}
  </div>
  <button
    type="button"
    class="media-gallery__more"
    aria-label={t("chat.moreFiles", { count: items.length - 1 })}
    onclick={() => (opened = 1)}
  >
    +{items.length - 1}
  </button>
</div>

{#if opened !== null}
  <MediaCarousel {items} {mine} start={opened} revealed={uncensored} onclose={() => (opened = null)} />
{/if}

<style>
  .media-gallery {
    width: 420px;
    max-width: 100%;
    height: 220px;
    margin: 4px 0;
    display: flex;
    gap: 6px;
  }

  .media-gallery__frame {
    position: relative;
    min-width: 0;
    height: 100%;
    flex-grow: 1;
    display: flex;
    overflow: hidden;
    border-radius: 8px;
  }

  .media-gallery__folder {
    opacity: 0;
    transition: opacity ease 0.15s;
  }

  .media-gallery__frame:hover .media-gallery__folder,
  .media-gallery__folder:focus-within {
    opacity: 1;
  }

  .media-gallery__media--blurred {
    filter: blur(28px);
    transform: scale(1.2);
  }

  .media-gallery__main,
  .media-gallery__more {
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: var(--surface-color);
    color: var(--muted-color);
  }

  .media-gallery__main {
    position: relative;
    min-width: 0;
    flex-grow: 1;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: #000000;
    cursor: pointer;
  }

  .media-gallery__media {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .media-gallery__icon {
    width: 32px;
    color: var(--subtle-color);
  }

  .media-gallery__play {
    position: absolute;
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(13, 13, 13, 0.8);
  }

  .media-gallery__play svg {
    width: 22px;
  }

  .media-gallery__more {
    width: 88px;
    flex: none;
    font-size: 22px;
    font-weight: 700;
    cursor: pointer;
    transition: background ease 0.15s;
  }

  .media-gallery__more:hover {
    background: var(--active-color);
  }
</style>
