<script lang="ts">
  import { t } from "@/i18n";
  import type { Conversation } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";

  type Action = "leave" | "delete";

  let {
    group,
    x,
    y,
    onphoto,
    onrename,
    onclose,
  }: {
    group: Conversation;
    x: number;
    y: number;
    onphoto: () => void;
    onrename: () => void;
    onclose: () => void;
  } = $props();

  let menu = $state<HTMLElement>();
  let confirming = $state<Action | null>(null);

  const owner = $derived(group.ownerId === chat.user?.id);
  const width = 200;
  const left = $derived(Math.min(x, window.innerWidth - width - 8));
  const count = $derived(owner ? (group.avatar ? 5 : 4) : 1);
  const top = $derived(Math.min(y, window.innerHeight - count * 36 - 20));

  function photo() {
    onphoto();
    onclose();
  }

  function rename() {
    onrename();
    onclose();
  }

  function removePhoto() {
    chat.removeGroupPhoto(group.id);
    onclose();
  }

  function choose(action: Action) {
    if (confirming !== action) {
      confirming = action;
      return;
    }
    const run = action === "leave" ? chat.leaveGroup(group.id) : chat.deleteGroup(group.id);
    run.catch(() => undefined);
    onclose();
  }

  function onpointerdown(event: PointerEvent) {
    if (!menu?.contains(event.target as Node)) {
      onclose();
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onclose();
    }
  }
</script>

<svelte:window {onpointerdown} {onkeydown} />

<div
  class="sidebar-group-menu"
  role="menu"
  aria-label={group.name}
  style:left="{left}px"
  style:top="{top}px"
  style:width="{width}px"
  bind:this={menu}
>
  {#if owner}
    <button
      class="sidebar-group-menu__item sidebar-group-menu__item--neutral"
      role="menuitem"
      onclick={rename}
      {@attach (button) => button.focus()}
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
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
      </svg>
      {t("group.rename")}
    </button>
    <button class="sidebar-group-menu__item sidebar-group-menu__item--neutral" role="menuitem" onclick={photo}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
      {group.avatar ? t("group.changePhoto") : t("group.addPhoto")}
    </button>
    {#if group.avatar}
      <button class="sidebar-group-menu__item sidebar-group-menu__item--neutral" role="menuitem" onclick={removePhoto}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
        {t("group.removePhoto")}
      </button>
    {/if}
  {/if}
  <button
    class="sidebar-group-menu__item"
    role="menuitem"
    onclick={() => choose("leave")}
    {@attach (button) => {
      if (!owner) {
        button.focus();
      }
    }}
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
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
    {confirming === "leave" ? t("group.confirmLeave") : t("group.leave")}
  </button>
  {#if owner}
    <button class="sidebar-group-menu__item" role="menuitem" onclick={() => choose("delete")}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      </svg>
      {confirming === "delete" ? t("group.confirmDelete") : t("group.delete")}
    </button>
  {/if}
</div>

<style>
  .sidebar-group-menu {
    position: fixed;
    z-index: 20;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-radius: 8px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }

  .sidebar-group-menu__item {
    width: 100%;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: #f6746b;
    font-size: var(--hint-font-size);
    text-align: left;
    transition: background ease 0.1s;
  }

  .sidebar-group-menu__item--neutral {
    color: var(--muted-color);
  }

  .sidebar-group-menu__item:hover,
  .sidebar-group-menu__item:focus-visible {
    background: var(--hover-color);
  }

  .sidebar-group-menu__item svg {
    width: 14px;
    flex: none;
  }
</style>
