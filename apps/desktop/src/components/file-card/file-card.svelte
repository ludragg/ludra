<script lang="ts">
  import { convertFileSrc } from "@tauri-apps/api/core";
  import AudioPlayer from "@/components/audio-player/audio-player.svelte";
  import FolderButton from "@/components/folder-button/folder-button.svelte";
  import FileMedia from "@/components/file-media/file-media.svelte";
  import ImageViewer from "@/components/image-viewer/image-viewer.svelte";
  import VoiceNote from "@/components/voice-note/voice-note.svelte";
  import {
    categoryOf,
    formatSize,
    isVoice,
    listenableTypes,
    playableTypes,
    viewableTypes,
    voiceSeconds,
  } from "@/helpers/files";
  import { rendition, Thumbnail } from "@/helpers/rendition.svelte";
  import { t } from "@/i18n";
  import type { Message } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";
  import { files } from "@/stores/files.svelte";

  let { message, sender, mine }: { message: Message; sender: string; mine: boolean } = $props();

  let missing = $state(false);
  let local = $state<string | null>(null);
  let wanted = $state(false);
  let viewing = $state(false);
  let uncensored = $state<string | null>(null);
  const onfolder = $derived(local ? () => void openFolder() : null);

  const file = $derived(message.file!);
  const size = $derived(Number(file.size));
  const category = $derived(categoryOf(file.mime));
  const media = $derived(viewableTypes.has(file.mime) ? "image" : playableTypes.has(file.mime) ? "video" : null);
  const transfer = $derived(files.transfers[message.id]);
  const busy = $derived(transfer?.state === "waiting" || transfer?.state === "receiving");
  const expired = $derived(!file.direct || missing || transfer?.state === "expired");
  const friendsOnly = $derived(!mine && !expired && !chat.isFriend(message.senderId));
  const downloadable = $derived(!expired && !mine && !friendsOnly);
  const inline = $derived(media !== null && !expired && !friendsOnly);
  const voice = $derived(isVoice(file.mime));
  const listenable = $derived(!voice && listenableTypes.has(file.mime) && !expired && !friendsOnly);
  const source = $derived(local ? convertFileSrc(local) : null);
  const thumbnail = new Thumbnail(() => (media === "image" ? local : null));
  const censored = $derived(media !== null && file.censored && uncensored !== message.id);

  $effect(() => {
    void transfer?.state;
    void files.mediaPath(message).then((path) => (local = path));
  });

  $effect(() => {
    if (mine) {
      void checkShared();
    }
  });

  async function checkShared() {
    const shared = await files.shared(message.id);
    missing = shared === null || !shared.available;
  }

  async function openFolder() {
    local = await files.openFolder(message);
    if (!local) {
      wanted = false;
      if (mine) {
        await checkShared();
      }
    }
  }

  function request() {
    if (downloadable && !busy) {
      wanted = true;
      void files.download(message);
    }
  }

  function voiceCaption(): string {
    if (expired) {
      return t("chat.fileExpired");
    }
    if (friendsOnly) {
      return t("chat.fileFriendsOnly", { name: sender });
    }
    if (transfer?.state === "receiving") {
      return `${Math.floor((transfer.received / Math.max(1, transfer.total)) * 100)}%`;
    }
    return transfer && transfer.state !== "done" ? status() : "";
  }

  function listen() {
    if (downloadable && !busy) {
      wanted = true;
      void files.listen(message);
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

  function caption(): string {
    if (busy) {
      return status();
    }
    if (source) {
      return "";
    }
    return media === "video" ? t("chat.downloadToWatch") : t("chat.downloadToView");
  }

  function detail(): string {
    const text = transfer && transfer.state !== "done" ? status() : "";
    return text || `${formatSize(size)} ${origin()}`;
  }

  function status(): string {
    switch (transfer?.state) {
      case "waiting":
        return t("chat.fileStarting");
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

{#if voice}
  <VoiceNote
    {source}
    seconds={voiceSeconds(file.name)}
    seed={message.id}
    caption={voiceCaption()}
    {wanted}
    {onfolder}
    disabled={expired || friendsOnly}
    onrequest={listen}
  />
{:else if inline && media}
  <FileMedia
    kind={media}
    source={media === "image" ? thumbnail.url : source}
    original={source}
    {censored}
    onuncensor={() => (uncensored = message.id)}
    name={file.name}
    detail={detail()}
    caption={caption()}
    {busy}
    progress={transfer?.state === "receiving" ? transfer.received / Math.max(1, transfer.total) : null}
    disabled={!downloadable || busy || local !== null}
    {wanted}
    onrequest={request}
    oncancel={() => files.cancel(message.id)}
    onview={() => (viewing = true)}
    {onfolder}
  />
{:else}
  <div class="file-card" class:file-card--faded={expired || friendsOnly}>
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
      {#if onfolder && !busy}
        <FolderButton variant="row" onclick={onfolder} />
      {/if}
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
    {#if listenable}
      <AudioPlayer
        {source}
        caption={transfer?.state === "waiting" ? status() : ""}
        {wanted}
        onrequest={listen}
        onreveal={() => void openFolder()}
      />
    {/if}
    {#if transfer?.state === "receiving"}
      <div class="file-card__progress">
        <span class="file-card__bar">
          <span class="file-card__fill" style:width="{(transfer.received / Math.max(1, transfer.total)) * 100}%"></span>
        </span>
        <span class="file-card__percent">{status()}</span>
      </div>
    {/if}
  </div>
{/if}

{#if viewing && local && source}
  {@const path = local}
  <ImageViewer
    load={() => rendition(path, true)}
    preview={thumbnail.url}
    original={source}
    {onfolder}
    label={file.name}
    onclose={() => (viewing = false)}
  />
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
