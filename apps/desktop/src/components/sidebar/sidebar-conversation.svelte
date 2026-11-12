<script lang="ts">
  import Avatar from "@/components/avatar/avatar.svelte";
  import { formatRecent, toDate } from "@/helpers/time";
  import type { Conversation } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";

  let { conversation, active }: { conversation: Conversation; active: boolean } = $props();

  const peer = $derived(conversation.peer!);
  const last = $derived(conversation.lastMessage);
  const unread = $derived(chat.unread[conversation.id] ?? 0);
  const preview = $derived(
    !last ? "Nenhuma mensagem ainda" : last.senderId === chat.user?.id ? `Você: ${last.content}` : last.content,
  );
</script>

<button
  class="sidebar-conversation"
  class:sidebar-conversation--active={active}
  class:sidebar-conversation--unread={unread > 0}
  aria-current={active}
  onclick={() => chat.select(conversation.id)}
>
  <Avatar id={peer.id} name={peer.username} size="small" />
  <span class="sidebar-conversation__body">
    <span class="sidebar-conversation__row">
      <span class="sidebar-conversation__name">{peer.username}</span>
      {#if last}
        <time class="sidebar-conversation__time">{formatRecent(toDate(last.sentAt))}</time>
      {/if}
    </span>
    <span class="sidebar-conversation__row">
      <span class="sidebar-conversation__preview">{preview}</span>
      {#if unread > 0}
        <span class="sidebar-conversation__badge" aria-label="{unread} não lidas">{unread}</span>
      {/if}
    </span>
  </span>
</button>

<style>
  .sidebar-conversation {
    width: 100%;
    padding: 9px 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--muted-color);
    text-align: left;
    line-height: 1.35;
    transition: all ease 0.1s;
  }

  .sidebar-conversation:hover {
    background: var(--hover-color);
  }

  .sidebar-conversation--active,
  .sidebar-conversation--active:hover {
    background: var(--active-color);
  }

  .sidebar-conversation__body {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
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

  .sidebar-conversation__time {
    margin-left: auto;
    flex: none;
    font-size: var(--tiny-font-size);
    color: var(--subtle-color);
  }

  .sidebar-conversation__preview {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .sidebar-conversation--active .sidebar-conversation__preview {
    color: var(--body-color);
  }

  .sidebar-conversation--unread .sidebar-conversation__time {
    color: var(--muted-color);
    font-weight: 600;
  }

  .sidebar-conversation--unread .sidebar-conversation__preview {
    color: var(--muted-color);
  }

  .sidebar-conversation__badge {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: var(--brand-color);
    color: var(--dark-background-color);
    font-size: var(--tiny-font-size);
    font-weight: 700;
  }
</style>
