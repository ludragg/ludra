<script lang="ts">
  import ChatImage from "@/components/chat-image/chat-image.svelte";
  import { openExternal } from "@/helpers/external";
  import { youtubeEmbed, youtubeId } from "@/helpers/video";
  import { t } from "@/i18n";
  import type { LinkPreview } from "@/protocol/ludra/v1/models_pb";

  let { preview, onremove }: { preview: LinkPreview; onremove?: () => void } = $props();

  const safe = $derived(/^https?:\/\//i.test(preview.url));
  const video = $derived(youtubeId(preview.url));

  let playing = $state(false);
</script>

{#if safe}
  <div class="link-preview">
    {#if onremove}
      <button
        type="button"
        class="link-preview__remove"
        aria-label={t("chat.removePreview")}
        data-tooltip={t("chat.removePreview")}
        onclick={onremove}
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
    {#if preview.site}
      <span class="link-preview__site">{preview.site}</span>
    {/if}
    <a class="link-preview__title" href={preview.url} target="_blank" rel="noreferrer" onclick={openExternal}>
      {preview.title}
    </a>
    {#if preview.description}
      <p class="link-preview__description">{preview.description}</p>
    {/if}
    {#if video}
      <div class="link-preview__video">
        {#if playing}
          <iframe
            class="link-preview__frame"
            src={youtubeEmbed(video)}
            title={preview.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
          ></iframe>
        {:else}
          <button
            type="button"
            class="link-preview__play"
            aria-label={t("chat.playVideo")}
            data-tooltip={t("chat.playVideo")}
            onclick={() => (playing = true)}
          >
            {#if preview.image}
              <ChatImage image={preview.image} label={preview.title} maxWidth={392} maxHeight={392} />
            {/if}
            <span class="link-preview__play-icon">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 6.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 8 6.5z" />
              </svg>
            </span>
          </button>
        {/if}
      </div>
    {:else if preview.image}
      <a
        class="link-preview__image"
        href={preview.url}
        target="_blank"
        rel="noreferrer"
        tabindex="-1"
        onclick={openExternal}
      >
        <ChatImage image={preview.image} label={preview.title} maxWidth={392} maxHeight={240} />
      </a>
    {/if}
  </div>
{/if}

<style>
  .link-preview {
    position: relative;
    width: 420px;
    max-width: 100%;
    margin-top: 6px;
    padding: 12px 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--surface-color);
  }

  .link-preview__remove {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--subtle-color);
    opacity: 0;
    transition:
      opacity ease 0.15s,
      color ease 0.15s;
  }

  .link-preview:hover .link-preview__remove,
  .link-preview__remove:focus-visible {
    opacity: 1;
  }

  .link-preview__remove:hover {
    color: var(--muted-color);
  }

  .link-preview__remove svg {
    width: 14px;
  }

  .link-preview__site {
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .link-preview__title {
    padding-right: 20px;
    display: -webkit-box;
    overflow: hidden;
    color: var(--brand-color);
    font-weight: 600;
    text-decoration: none;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .link-preview__title:hover {
    text-decoration: underline;
  }

  .link-preview__description {
    margin: 0;
    display: -webkit-box;
    overflow: hidden;
    font-size: var(--hint-font-size);
    color: var(--body-color);
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  .link-preview__image {
    margin-top: 6px;
    display: block;
  }

  .link-preview__video {
    margin-top: 6px;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 8px;
    background: #000000;
  }

  .link-preview__frame {
    width: 100%;
    height: 100%;
    display: block;
    border: 0;
  }

  .link-preview__play {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .link-preview__play :global(.chat-image) {
    position: absolute;
    inset: 0;
    margin: auto;
    border-radius: 0;
  }

  .link-preview__play-icon {
    position: relative;
    width: 56px;
    height: 56px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(13, 13, 13, 0.8);
    color: var(--muted-color);
    transition:
      background ease 0.15s,
      transform ease 0.15s;
  }

  .link-preview__play:hover .link-preview__play-icon {
    background: var(--brand-color);
    color: var(--on-brand-color);
    transform: scale(1.06);
  }

  .link-preview__play-icon svg {
    width: 24px;
  }
</style>
