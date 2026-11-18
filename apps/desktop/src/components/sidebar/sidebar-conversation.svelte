<script lang="ts">
  import { onDestroy } from "svelte";
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import Avatar from "@/components/avatar/avatar.svelte";
  import UserMenu from "@/components/user-menu/user-menu.svelte";
  import { Elapsed } from "@/helpers/duration.svelte";
  import { t } from "@/i18n";
  import type { Conversation } from "@/protocol/ludra/v1/models_pb";
  import { calls } from "@/stores/call.svelte";
  import { chat } from "@/stores/chat.svelte";

  let { conversation, active }: { conversation: Conversation; active: boolean } = $props();

  const peer = $derived(conversation.peer!);
  let menu = $state<{ x: number; y: number } | null>(null);

  function openMenu(event: MouseEvent) {
    event.preventDefault();
    menu = { x: event.clientX, y: event.clientY };
  }

  const elapsed = new Elapsed();
  onDestroy(() => elapsed.stop());

  const callStart = $derived(calls.current?.peer.id === peer.id ? calls.current.startedAt : null);
  const unread = $derived(chat.unread[conversation.id] ?? 0);
</script>

<button
  class="sidebar-conversation"
  class:sidebar-conversation--active={active}
  class:sidebar-conversation--unread={unread > 0}
  aria-current={active}
  onclick={() => chat.select(conversation.id)}
  oncontextmenu={openMenu}
>
  <Avatar user={peer} size="small" presence={peer.presence} />
  <span class="sidebar-conversation__body">
    <span class="sidebar-conversation__row">
      <span class="sidebar-conversation__name">{peer.username}</span>
    </span>
    <span class="sidebar-conversation__row">
      {#if callStart !== null}
        <span class="sidebar-conversation__live">
          <span class="sidebar-conversation__live-icon"><CallIcon name="phone" /></span>
          {elapsed.format(callStart)}
        </span>
      {/if}
      {#if unread > 0}
        <span class="sidebar-conversation__badge" aria-label={t("sidebar.unread", { count: unread })}>{unread}</span>
      {/if}
    </span>
  </span>
</button>

{#if menu}
  <UserMenu user={peer} x={menu.x} y={menu.y} onclose={() => (menu = null)} />
{/if}

<style>
  .sidebar-conversation {
    width: 100%;
    height: 42px;
    padding: 0 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--subtle-color);
    font-weight: 500;
    text-align: left;
    line-height: 1.35;
    transition: all ease 0.1s;
  }

  .sidebar-conversation:hover {
    --avatar-ring: #35373c;
    background: #35373c;
    color: var(--body-color);
  }

  .sidebar-conversation--active,
  .sidebar-conversation--active:hover {
    --avatar-ring: #404249;
    background: var(--active-color);
    color: #ffffff;
  }

  .sidebar-conversation__body {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sidebar-conversation__row:first-child {
    min-width: 0;
    flex-grow: 1;
  }

  .sidebar-conversation__row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sidebar-conversation__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .sidebar-conversation__live {
    flex-grow: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--small-font-size);
    font-weight: 600;
    color: var(--success-color);
    font-variant-numeric: tabular-nums;
  }

  .sidebar-conversation__live-icon {
    width: 12px;
    height: 12px;
    display: flex;
  }

  .sidebar-conversation--unread {
    color: #ffffff;
  }

  .sidebar-conversation__badge {
    min-width: 18px;
    height: 18px;
    padding: 0 5px 1px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: var(--error-color);
    color: var(--on-brand-color);
    font-size: var(--tiny-font-size);
    font-weight: 700;
  }
</style>
