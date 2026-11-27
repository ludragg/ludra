<script lang="ts">
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { untrack } from "svelte";
  import CensoredVideo from "@/components/censored-video/censored-video.svelte";
  import CarouselControls from "@/components/carousel-controls/carousel-controls.svelte";
  import FolderButton from "@/components/folder-button/folder-button.svelte";
  import ImageViewer from "@/components/image-viewer/image-viewer.svelte";
  import VideoPlayer from "@/components/video-player/video-player.svelte";
  import { formatSize, playableTypes } from "@/helpers/files";
  import { rendition, Thumbnail } from "@/helpers/rendition.svelte";
  import { t } from "@/i18n";
  import type { Message } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";
  import { files } from "@/stores/files.svelte";

  let {
    items,
    mine,
    start = 0,
    revealed = null,
    onclose,
  }: {
    items: Message[];
    mine: boolean;
    start?: number;
    revealed?: string | null;
    onclose: () => void;
  } = $props();

  let index = $state(untrack(() => start));
  let local = $state<string | null>(null);
  let uncensored = $state(untrack(() => revealed));

  const item = $derived(items[index]);
  const file = $derived(item.file!);
  const onfolder = $derived(local ? () => void openFolder() : null);
  const censored = $derived(file.censored && uncensored !== item.id);
  const video = $derived(playableTypes.has(file.mime));
  const transfer = $derived(files.transfers[item.id]);
  const busy = $derived(transfer?.state === "waiting" || transfer?.state === "receiving");
  const source = $derived(local ? convertFileSrc(local) : null);
  const thumbnail = new Thumbnail(() => (video ? null : local));
  const downloadable = $derived(!mine && chat.isFriend(item.senderId));
  const position = $derived(`${index + 1} / ${items.length}`);
  const percent = $derived(
    transfer?.state === "receiving" ? Math.floor((transfer.received / Math.max(1, transfer.total)) * 100) : 0,
  );

  $effect(() => {
    const id = item.id;
    void transfer?.state;
    local = null;
    void files.mediaPath(item).then((path) => {
      if (id === item.id) {
        local = path;
      }
    });
  });

  async function openFolder() {
    const current = item;
    const path = await files.openFolder(current);
    if (current.id === item.id) {
      local = path;
    }
  }

  function previous() {
    uncensored = null;
    index = (index + items.length - 1) % items.length;
  }

  function next() {
    uncensored = null;
    index = (index + 1) % items.length;
  }

  function keys(event: KeyboardEvent) {
    if (source && !video) {
      return;
    }
    if (event.key === "ArrowLeft") {
      previous();
    } else if (event.key === "ArrowRight") {
      next();
    } else if (event.key === "Escape") {
      onclose();
    }
  }
</script>

<svelte:window onkeydown={keys} />

{#if local && source && !video}
  {@const path = local}
  {#key item.id}
    <ImageViewer
      load={() => rendition(path, true)}
      preview={thumbnail.url}
      original={source}
      {onfolder}
      {censored}
      onuncensor={() => (uncensored = item.id)}
      label={file.name}
      {position}
      onprevious={previous}
      onnext={next}
      {onclose}
    />
  {/key}
{:else}
  <div class="media-carousel" role="dialog" aria-modal="true" aria-label={file.name}>
    <button type="button" class="media-carousel__backdrop" aria-label={t("titleBar.close")} onclick={onclose}></button>
    <div class="media-carousel__stage">
      {#key item.id}
        {#if source && video}
          <div class="media-carousel__video">
            {#if onfolder && censored}
              <FolderButton variant="overlay" onclick={onfolder} />
            {/if}
            {#if censored}
              <CensoredVideo {source} onuncensor={() => (uncensored = item.id)} />
            {:else}
              <VideoPlayer
                {source}
                caption=""
                name={file.name}
                detail={formatSize(Number(file.size))}
                autoplay
                {onfolder}
              />
            {/if}
          </div>
        {:else}
          <div class="media-carousel__pending">
            <span class="media-carousel__name">{file.name}</span>
            <span class="media-carousel__size">{formatSize(Number(file.size))}</span>
            {#if busy}
              <span class="media-carousel__size">
                {transfer?.state === "receiving" ? `${percent}%` : t("chat.fileStarting")}
              </span>
            {:else if downloadable}
              <button type="button" class="media-carousel__download" onclick={() => files.download(item)}>
                {t("chat.download")}
              </button>
            {/if}
          </div>
        {/if}
      {/key}
    </div>
    <CarouselControls {position} onprevious={previous} onnext={next} />
    <button type="button" class="media-carousel__close" aria-label={t("titleBar.close")} onclick={onclose}>
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

<style>
  .media-carousel {
    position: fixed;
    inset: 32px 0 0;
    z-index: 50;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.88);
    animation: fade 0.15s ease;
  }

  .media-carousel__backdrop {
    position: absolute;
    inset: 0;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: default;
  }

  .media-carousel__stage {
    position: relative;
    max-width: calc(100% - 192px);
    max-height: calc(100% - 128px);
    display: grid;
    place-items: center;
  }

  .media-carousel__video {
    position: relative;
    width: min(960px, calc(100vw - 192px));
  }

  .media-carousel__pending {
    min-width: 280px;
    padding: 28px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--dark-background-color);
  }

  .media-carousel__name {
    max-width: 420px;
    overflow: hidden;
    font-weight: 600;
    color: var(--muted-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .media-carousel__size {
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .media-carousel__download {
    margin-top: 10px;
    padding: 8px 18px;
    border: 0;
    border-radius: 6px;
    background: var(--muted-color);
    color: var(--dark-background-color);
    font-weight: 600;
  }

  .media-carousel__close {
    position: absolute;
    top: 16px;
    right: 16px;
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

  .media-carousel__close:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .media-carousel__close svg {
    width: 16px;
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
