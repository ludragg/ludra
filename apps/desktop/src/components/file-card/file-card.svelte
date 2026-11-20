<script lang="ts">
  import { convertFileSrc } from "@tauri-apps/api/core";
  import ImageViewer from "@/components/image-viewer/image-viewer.svelte";
  import VideoPlayer from "@/components/video-player/video-player.svelte";
  import { categoryOf, formatSize } from "@/helpers/files";
  import { t } from "@/i18n";
  import type { Message } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";
  import { files } from "@/stores/files.svelte";

  const playable = new Set(["video/mp4", "video/webm", "video/quicktime"]);
  const viewable = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"]);

  let { message, sender, mine }: { message: Message; sender: string; mine: boolean } = $props();

  let missing = $state(false);
  let local = $state<string | null>(null);
  let wanted = $state(false);
  let viewing = $state(false);

  const file = $derived(message.file!);
  const size = $derived(Number(file.size));
  const category = $derived(categoryOf(file.mime));
  const media = $derived(viewable.has(file.mime) ? "image" : playable.has(file.mime) ? "video" : null);
  const transfer = $derived(files.transfers[message.id]);
  const busy = $derived(
    transfer?.state === "waiting" || transfer?.state === "connecting" || transfer?.state === "receiving",
  );
  const expired = $derived(!file.direct || missing || transfer?.state === "expired");
  const friendsOnly = $derived(!mine && !expired && !chat.isFriend(message.senderId));
  const downloadable = $derived(!expired && !mine && !friendsOnly);
  const source = $derived(local ? convertFileSrc(local) : null);

  $effect(() => {
    void transfer?.state;
    void files.mediaPath(message.id).then((path) => (local = path));
  });

  $effect(() => {
    if (mine) {
      void files.shared(message.id).then((shared) => (missing = shared === null || !shared.available));
    }
  });

  function request() {
    if (downloadable && !busy) {
      wanted = true;
      void files.download(message);
    }
  }

  function origin(): string {
    if (expired) {
      return t("chat.fileExpired");
    }
    if (friendsOnly) {
      return t("chat.fileFriendsOnly", { name: sender });
    }
    return mine ? t("chat.fileDirectMine") : t("chat.fileDirectFrom", { name: sender });
  }

  function status(): string {
    switch (transfer?.state) {
      case "waiting":
        return t("chat.fileWaiting", { name: sender });
      case "connecting":
        return t("chat.fileConnecting");
      case "receiving":
        return `${Math.floor((transfer.received / Math.max(1, transfer.total)) * 100)}% (${formatSize(transfer.speed)}/s)`;
      case "done":
        return t("chat.fileSaved");
      case "offline":
        return t("chat.fileOffline", { name: sender });
      case "friendsOnly":
        return t("chat.fileFriendsOnly", { name: sender });
      case "unavailable":
        return t("chat.fileResend", { name: sender });
      case "expired":
        return t("chat.fileExpired");
      case "failed":
        return t("chat.fileDownloadFailed");
      case "canceled":
        return t("chat.fileCanceled");
      default:
        return "";
    }
  }
</script>

<div
  class="file-card"
  class:file-card--media={media && !expired && !friendsOnly}
  class:file-card--faded={expired || friendsOnly}
>
  {#if media === "video" && !expired && !friendsOnly}
    <VideoPlayer
      {source}
      caption={busy ? status() : source ? `${file.name} (${formatSize(size)})` : t("chat.downloadToWatch")}
      autoplay={wanted}
      onrequest={request}
      onreveal={() => files.reveal(message.id)}
    />
  {:else if media === "image" && !expired && !friendsOnly}
    {#if source}
      <button type="button" class="file-card__photo" aria-label={t("chat.openPhoto")} onclick={() => (viewing = true)}>
        <img class="file-card__image" src={source} alt={file.name} draggable="false" />
      </button>
    {:else}
      <button type="button" class="file-card__placeholder" disabled={!downloadable || busy} onclick={request}>
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
        <span>{busy ? status() : t("chat.downloadToView")}</span>
      </button>
    {/if}
  {/if}
  <div class="file-card__row">
    <span class="file-card__icon file-card__icon--{category}">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        {#if category === "image"}
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        {:else if category === "video"}
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M10 9l5 3-5 3z" />
        {:else if category === "audio"}
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        {:else if category === "archive"}
          <path d="M21 8v13H3V8" />
          <path d="M1 3h22v5H1z" />
          <path d="M10 12h4" />
        {:else if category === "code"}
          <path d="M16 18l6-6-6-6" />
          <path d="M8 6l-6 6 6 6" />
        {:else}
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        {/if}
      </svg>
    </span>
    <span class="file-card__text">
      <span class="file-card__name" data-tooltip={file.name}>{file.name}</span>
      <span class="file-card__detail">
        {#if transfer && transfer.state !== "receiving" && transfer.state !== "done"}
          {status()}
        {:else}
          {formatSize(size)} {origin()}
        {/if}
      </span>
    </span>
    {#if busy}
      <button
        type="button"
        class="file-card__action"
        aria-label={t("chat.cancelDownload")}
        data-tooltip={t("chat.cancelDownload")}
        onclick={() => files.cancel(message.id)}
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
    {:else if downloadable}
      <button
        type="button"
        class="file-card__action file-card__action--strong"
        aria-label={t("chat.download")}
        data-tooltip={t("chat.download")}
        onclick={() => files.download(message)}
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
          {#if transfer?.state === "done"}
            <path d="M5 12l5 5L20 7" />
          {:else}
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
          {/if}
        </svg>
      </button>
    {/if}
  </div>
  {#if transfer?.state === "receiving"}
    <div class="file-card__progress">
      <span class="file-card__bar">
        <span class="file-card__fill" style:width="{(transfer.received / Math.max(1, transfer.total)) * 100}%"></span>
      </span>
      <span class="file-card__percent">{status()}</span>
    </div>
  {/if}
</div>

{#if viewing && source}
  {@const current = source}
  <ImageViewer load={async () => current} label={file.name} onclose={() => (viewing = false)} />
{/if}

<style>
  .file-card {
    width: 380px;
    max-width: 100%;
    margin: 4px 0;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--surface-color);
  }

  .file-card--media {
    width: 420px;
  }

  .file-card__photo {
    padding: 0;
    display: block;
    overflow: hidden;
    border: 0;
    border-radius: 8px;
    background: #000000;
    cursor: pointer;
  }

  .file-card__image {
    width: 100%;
    max-height: 420px;
    display: block;
    object-fit: contain;
  }

  .file-card__placeholder {
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

  .file-card__placeholder:not(:disabled):hover {
    color: var(--muted-color);
  }

  .file-card__placeholder svg {
    width: 32px;
  }

  .file-card--faded {
    opacity: 0.7;
  }

  .file-card__row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .file-card__icon {
    width: 40px;
    height: 40px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: color-mix(in srgb, var(--brand-color) 14%, transparent);
    color: var(--brand-color);
  }

  .file-card__icon--video,
  .file-card__icon--audio {
    background: rgba(62, 98, 192, 0.18);
    color: #7d9be8;
  }

  .file-card__icon--archive,
  .file-card__icon--other {
    background: var(--surface-color);
    color: var(--subtle-color);
  }

  .file-card__icon svg {
    width: 20px;
  }

  .file-card__text {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    line-height: 1.35;
  }

  .file-card__name {
    overflow: hidden;
    font-weight: 600;
    color: var(--muted-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-card__detail {
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .file-card__action {
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

  .file-card__action--strong {
    color: var(--muted-color);
  }

  .file-card__action:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .file-card__action svg {
    width: 18px;
  }

  .file-card__progress {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .file-card__bar {
    height: 4px;
    flex-grow: 1;
    overflow: hidden;
    border-radius: 2px;
    background: var(--border-color);
  }

  .file-card__fill {
    height: 100%;
    display: block;
    background: var(--brand-color);
    transition: width linear 0.1s;
  }

  .file-card__percent {
    font-size: var(--small-font-size);
    font-variant-numeric: tabular-nums;
    color: var(--subtle-color);
  }
</style>
