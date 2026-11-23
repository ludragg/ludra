<script lang="ts">
  import MediaHint from "@/components/media-hint/media-hint.svelte";
  import VideoPlayer from "@/components/video-player/video-player.svelte";
  import { copyMenu } from "@/helpers/image-menu";
  import { t } from "@/i18n";

  let {
    kind,
    source,
    name,
    detail,
    caption,
    busy,
    progress,
    disabled,
    wanted,
    onrequest,
    oncancel,
    onreveal,
    onview,
  }: {
    kind: "image" | "video";
    source: string | null;
    name: string;
    detail: string;
    caption: string;
    busy: boolean;
    progress: number | null;
    disabled: boolean;
    wanted: boolean;
    onrequest: () => void;
    oncancel: () => void;
    onreveal: () => void;
    onview: () => void;
  } = $props();

  let hovered = $state(false);
</script>

<div
  class="file-media"
  role="presentation"
  onpointerenter={() => (hovered = true)}
  onpointerleave={() => (hovered = false)}
  onfocusin={() => (hovered = true)}
  onfocusout={() => (hovered = false)}
>
  {#if kind === "video"}
    <VideoPlayer {source} {caption} {name} {detail} pinned={busy} autoplay={wanted} {onrequest} {onreveal} />
  {:else if source}
    <button type="button" class="file-media__photo" aria-label={t("chat.openPhoto")} onclick={onview}>
      <img class="file-media__image" src={source} alt={name} draggable="false" {@attach copyMenu(() => source)} />
    </button>
  {:else}
    <button type="button" class="file-media__placeholder" {disabled} onclick={onrequest}>
      <svg
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
      <span>{caption}</span>
    </button>
  {/if}
  {#if kind === "image"}
    <MediaHint {name} {detail} visible={hovered || busy} />
  {/if}
  {#if busy}
    <button
      type="button"
      class="file-media__cancel"
      aria-label={t("chat.cancelDownload")}
      data-tooltip={t("chat.cancelDownload")}
      onclick={oncancel}
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
  {/if}
  {#if progress !== null}
    <span class="file-media__bar"><span class="file-media__fill" style:width="{progress * 100}%"></span></span>
  {/if}
</div>

<style>
  .file-media {
    position: relative;
    width: 420px;
    max-width: 100%;
    margin: 4px 0;
    overflow: hidden;
    border-radius: 8px;
  }

  .file-media__photo {
    width: 100%;
    padding: 0;
    display: block;
    overflow: hidden;
    border: 0;
    border-radius: 8px;
    background: #000000;
    cursor: pointer;
  }

  .file-media__image {
    width: 100%;
    max-height: 420px;
    display: block;
    object-fit: contain;
  }

  .file-media__placeholder {
    width: 100%;
    aspect-ratio: 16 / 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border: 0;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.35);
    color: var(--subtle-color);
    font-size: var(--small-font-size);
  }

  .file-media__placeholder:not(:disabled):hover {
    color: var(--muted-color);
  }

  .file-media__placeholder svg {
    width: 32px;
  }

  .file-media__cancel {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    color: #f0f1f7;
    transition: background ease 0.15s;
  }

  .file-media__cancel:hover {
    background: rgba(0, 0, 0, 0.8);
  }

  .file-media__cancel svg {
    width: 14px;
  }

  .file-media__bar {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 3px;
    background: rgba(255, 255, 255, 0.18);
  }

  .file-media__fill {
    height: 100%;
    display: block;
    background: var(--brand-color);
    transition: width linear 0.1s;
  }
</style>
