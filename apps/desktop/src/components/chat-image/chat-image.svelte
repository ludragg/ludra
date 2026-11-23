<script lang="ts">
  import { copyMenu } from "@/helpers/image-menu";
  import type { ImageRef } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";

  let {
    image,
    label,
    maxWidth = 400,
    maxHeight = 320,
    onopen,
  }: { image: ImageRef; label: string; maxWidth?: number; maxHeight?: number; onopen?: () => void } = $props();

  let url = $state("");

  const width = $derived(Math.round(image.width * Math.min(1, maxWidth / image.width, maxHeight / image.height)));

  $effect(() => {
    const id = image.id;
    url = "";
    chat
      .image(id)
      .then((value) => {
        if (image.id === id) {
          url = value;
        }
      })
      .catch(() => undefined);
  });
</script>

{#if onopen}
  <button
    type="button"
    class="chat-image chat-image--button"
    style:width="min(100%, {width}px)"
    style:aspect-ratio="{image.width} / {image.height}"
    aria-label={label}
    onclick={onopen}
  >
    {#if url}
      <img class="chat-image__img" src={url} alt="" draggable="false" {@attach copyMenu(() => url)} />
    {/if}
  </button>
{:else}
  <span class="chat-image" style:width="min(100%, {width}px)" style:aspect-ratio="{image.width} / {image.height}">
    {#if url}
      <img class="chat-image__img" src={url} alt={label} draggable="false" {@attach copyMenu(() => url)} />
    {/if}
  </span>
{/if}

<style>
  .chat-image {
    padding: 0;
    display: block;
    overflow: hidden;
    border: 0;
    border-radius: 8px;
    background: var(--surface-color);
  }

  .chat-image--button {
    cursor: pointer;
  }

  .chat-image__img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    animation: appear 0.15s ease;
  }

  @keyframes appear {
    from {
      opacity: 0;
    }
  }
</style>
