<script lang="ts">
  import { t } from "@/i18n";
  import { ErrorCode, type Gif } from "@/protocol/ludra/v1/server_pb";
  import { ServerError } from "@/services/client";
  import { chat } from "@/stores/chat.svelte";

  let { onpick }: { onpick: (gif: Gif) => void } = $props();

  let query = $state("");
  let gifs = $state<Gif[]>([]);
  let next = $state("");
  let loading = $state(false);
  let failure = $state("");
  let urls = $state<Record<string, string>>({});
  let generation = 0;

  $effect(() => {
    const text = query.trim();
    const timer = window.setTimeout(() => void load(text, true), text ? 350 : 0);
    return () => window.clearTimeout(timer);
  });

  async function load(text: string, fresh: boolean) {
    const current = fresh ? ++generation : generation;
    loading = true;
    failure = "";
    try {
      const page = await chat.searchGifs(text, fresh ? "" : next);
      if (current !== generation) {
        return;
      }
      gifs = fresh ? page.gifs : [...gifs, ...page.gifs];
      next = page.gifs.length > 0 ? page.next : "";
      for (const gif of page.gifs) {
        void chat
          .gifPreview(gif.id)
          .then((url) => (urls[gif.id] = url))
          .catch(() => undefined);
      }
    } catch (cause) {
      if (current === generation) {
        failure =
          cause instanceof ServerError && cause.code === ErrorCode.UNAVAILABLE
            ? t("chat.gifsUnavailable")
            : t("chat.gifsFailed");
      }
    } finally {
      if (current === generation) {
        loading = false;
      }
    }
  }

  function scroll(event: Event) {
    const list = event.currentTarget as HTMLElement;
    if (!loading && next && list.scrollHeight - list.scrollTop - list.clientHeight < 200) {
      void load(query.trim(), false);
    }
  }
</script>

<div class="gif-picker" role="dialog" aria-label={t("chat.gif")}>
  <label class="gif-picker__search">
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
    <input
      class="gif-picker__input"
      type="search"
      placeholder={t("chat.searchGifs")}
      aria-label={t("chat.searchGifs")}
      autocomplete="off"
      spellcheck="false"
      maxlength="100"
      bind:value={query}
      {@attach (input) => input.focus()}
    />
  </label>

  {#if !query.trim() && !failure}
    <span class="gif-picker__label">{t("chat.trendingGifs")}</span>
  {/if}

  <div class="gif-picker__list" onscroll={scroll}>
    {#if failure}
      <p class="gif-picker__message">{failure}</p>
    {:else if !loading && gifs.length === 0}
      <p class="gif-picker__message">{t("chat.noGifs")}</p>
    {:else}
      <div class="gif-picker__grid">
        {#each gifs as gif (gif.id)}
          <button
            type="button"
            class="gif-picker__gif"
            style:aspect-ratio="{gif.width} / {gif.height}"
            aria-label={gif.title || t("chat.gif")}
            onclick={() => onpick(gif)}
          >
            {#if urls[gif.id]}
              <img class="gif-picker__image" src={urls[gif.id]} alt="" draggable="false" />
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <span class="gif-picker__brand">Powered by KLIPY</span>
</div>

<style>
  .gif-picker {
    width: 440px;
    max-width: calc(100vw - 48px);
    height: 420px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--dark-background-color);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .gif-picker__search {
    height: 36px;
    padding: 0 10px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--background-color);
    color: var(--subtle-color);
    transition: border-color ease 0.2s;
  }

  .gif-picker__search:focus-within {
    border-color: rgba(255, 255, 255, 0.3);
  }

  .gif-picker__search svg {
    width: 16px;
    flex: none;
  }

  .gif-picker__input {
    min-width: 0;
    flex-grow: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--muted-color);
  }

  .gif-picker__input::-webkit-search-cancel-button {
    display: none;
  }

  .gif-picker__label {
    font-size: var(--small-font-size);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--subtle-color);
  }

  .gif-picker__list {
    min-height: 0;
    flex-grow: 1;
    overflow-y: auto;
  }

  .gif-picker__grid {
    columns: 2;
    column-gap: 8px;
  }

  .gif-picker__gif {
    width: 100%;
    margin-bottom: 8px;
    padding: 0;
    display: block;
    overflow: hidden;
    break-inside: avoid;
    border: 0;
    border-radius: 6px;
    background: var(--surface-color);
    cursor: pointer;
  }

  .gif-picker__gif:hover {
    outline: 2px solid var(--brand-color);
    outline-offset: -2px;
  }

  .gif-picker__image {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .gif-picker__message {
    margin: 24px 0 0;
    text-align: center;
    color: var(--subtle-color);
  }

  .gif-picker__brand {
    align-self: flex-end;
    font-size: var(--tiny-font-size);
    color: var(--subtle-color);
  }
</style>
