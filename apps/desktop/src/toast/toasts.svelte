<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import Avatar from "@/components/avatar/avatar.svelte";
  import GroupAvatar from "@/components/group-avatar/group-avatar.svelte";
  import MentionText from "@/components/mention-text/mention-text.svelte";
  import { t } from "@/i18n";
  import type { Toast } from "@/services/toast";

  type Item = Toast & { key: number; until: number };

  const lifetime = 5000;
  const linger = 2000;
  const limit = 3;

  let items = $state<Item[]>([]);
  let ready = $state(false);
  let height = $state(0);
  let paused = false;
  let next = 0;

  async function take() {
    const incoming = await invoke<Toast[]>("toast_take").catch(() => []);
    const until = Date.now() + lifetime;
    items = [...items, ...incoming.map((toast) => ({ ...toast, key: next++, until }))].slice(-limit);
    ready = true;
  }

  function expire() {
    const now = Date.now();
    if (!paused && items.some(({ until }) => until <= now)) {
      items = items.filter(({ until }) => until > now);
    }
  }

  function dismiss(key: number) {
    items = items.filter((item) => item.key !== key);
  }

  function open(item: Item) {
    dismiss(item.key);
    invoke("toast_open", { target: item.target }).catch(() => undefined);
  }

  function resume() {
    paused = false;
    const until = Date.now() + linger;
    items = items.map((item) => ({ ...item, until: Math.max(item.until, until) }));
  }

  $effect(() => {
    const stop = listen("toast", take);
    take();
    const timer = window.setInterval(expire, 250);
    return () => {
      window.clearInterval(timer);
      stop.then((unlisten) => unlisten());
    };
  });

  $effect(() => {
    if (ready) {
      invoke("toast_layout", { height: items.length ? height : 0 }).catch(() => undefined);
    }
  });
</script>

<div
  class="toasts"
  role="region"
  aria-live="polite"
  bind:clientHeight={height}
  onpointerenter={() => (paused = true)}
  onpointerleave={resume}
>
  {#each items as item (item.key)}
    <div class="toasts__item">
      <button class="toasts__open" onclick={() => open(item)}>
        {#if item.kind === "group"}
          <GroupAvatar id={item.id} avatar={item.avatar} size="large" />
        {:else}
          <Avatar user={{ id: item.id, username: item.name, avatar: item.avatar }} size="large" />
        {/if}
        <span class="toasts__text">
          <span class="toasts__title">{item.title}</span>
          <span class="toasts__body"><MentionText text={item.body} names={new Set(item.mentions ?? [])} /></span>
        </span>
      </button>
      <button class="toasts__close" aria-label={t("titleBar.close")} onclick={() => dismiss(item.key)}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  {/each}
</div>

<style>
  :global(html),
  :global(body) {
    height: auto;
    overflow: hidden;
    background: transparent;
  }

  .toasts {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .toasts__item {
    position: relative;
    display: flex;
    border-radius: 10px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45);
    animation: toasts-in 0.18s ease-out;
  }

  .toasts__open {
    min-width: 0;
    flex: 1;
    padding: 12px 36px 12px 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    text-align: left;
  }

  .toasts__open:hover {
    background: var(--surface-color);
  }

  .toasts__text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toasts__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-display);
    font-weight: 600;
    color: var(--muted-color);
  }

  .toasts__body {
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow-wrap: anywhere;
    font-size: var(--hint-font-size);
    color: var(--body-color);
  }

  .toasts__close {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 22px;
    height: 22px;
    padding: 5px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--subtle-color);
    opacity: 0;
    transition: all ease 0.1s;
  }

  .toasts__item:hover .toasts__close,
  .toasts__close:focus-visible {
    opacity: 1;
  }

  .toasts__close:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  @keyframes toasts-in {
    from {
      opacity: 0;
      transform: translateX(24px);
    }
  }
</style>
