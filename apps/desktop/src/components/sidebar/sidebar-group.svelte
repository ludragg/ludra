<script lang="ts">
  import { onDestroy } from "svelte";
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import GroupAvatar from "@/components/group-avatar/group-avatar.svelte";
  import { isCall } from "@/helpers/call-summary";
  import { Elapsed } from "@/helpers/duration.svelte";
  import { eventSummary, groupCallSummary, isEvent } from "@/helpers/group-summary";
  import { formatRecent, toDate } from "@/helpers/time";
  import { t } from "@/i18n";
  import type { Conversation } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";
  import SidebarGroupMenu from "./sidebar-group-menu.svelte";

  let { conversation, active }: { conversation: Conversation; active: boolean } = $props();

  let menu = $state<{ x: number; y: number } | null>(null);
  let picker = $state<HTMLInputElement>();

  function pick(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) {
      chat.select(conversation.id).catch(() => undefined);
      chat.setGroupPhoto(conversation.id, file);
    }
  }

  function openMenu(event: MouseEvent) {
    event.preventDefault();
    menu = { x: event.clientX, y: event.clientY };
  }

  const elapsed = new Elapsed();
  onDestroy(() => elapsed.stop());

  const last = $derived(conversation.lastMessage);
  const callStart = $derived(conversation.call?.startedAt ? toDate(conversation.call.startedAt).getTime() : null);
  const unread = $derived(chat.unread[conversation.id] ?? 0);
  const myId = $derived(chat.user?.id ?? "");
  const nameOf = (userId: string) => chat.nameOf(userId);
  const preview = $derived(
    !last
      ? t("sidebar.noMessages")
      : isEvent(last)
        ? eventSummary(last, myId, nameOf)
        : isCall(last)
          ? groupCallSummary(last, myId, nameOf)
          : last.senderId === myId
            ? t("sidebar.youSaid", { content: last.content })
            : chat.isBlocked(last.senderId)
              ? t("chat.blockedMessage")
              : t("sidebar.memberSaid", { name: last.senderName || nameOf(last.senderId), content: last.content }),
  );
</script>

<button
  class="sidebar-group"
  class:sidebar-group--active={active}
  class:sidebar-group--unread={unread > 0}
  aria-current={active}
  onclick={() => chat.select(conversation.id)}
  oncontextmenu={openMenu}
>
  <GroupAvatar id={conversation.id} avatar={conversation.avatar} />
  <span class="sidebar-group__body">
    <span class="sidebar-group__row">
      <span class="sidebar-group__name">{conversation.name}</span>
      {#if last}
        <time class="sidebar-group__time">{formatRecent(toDate(last.sentAt))}</time>
      {/if}
    </span>
    <span class="sidebar-group__row">
      {#if callStart !== null}
        <span class="sidebar-group__live">
          <span class="sidebar-group__live-icon"><CallIcon name="phone" /></span>
          {elapsed.format(callStart)}
        </span>
      {:else}
        <span class="sidebar-group__preview">{preview}</span>
      {/if}
      {#if unread > 0}
        <span class="sidebar-group__badge" aria-label={t("sidebar.unread", { count: unread })}>{unread}</span>
      {/if}
    </span>
  </span>
</button>

{#if menu}
  <SidebarGroupMenu
    group={conversation}
    x={menu.x}
    y={menu.y}
    onphoto={() => picker?.click()}
    onclose={() => (menu = null)}
  />
{/if}
<input bind:this={picker} class="sr-only" type="file" accept="image/png" tabindex="-1" onchange={pick} />

<style>
  .sidebar-group {
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

  .sidebar-group:hover {
    background: var(--hover-color);
  }

  .sidebar-group--active,
  .sidebar-group--active:hover {
    background: var(--active-color);
  }

  .sidebar-group__body {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
  }

  .sidebar-group__row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sidebar-group__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .sidebar-group__live {
    flex-grow: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--small-font-size);
    font-weight: 600;
    color: var(--success-color);
    font-variant-numeric: tabular-nums;
  }

  .sidebar-group__live-icon {
    width: 12px;
    height: 12px;
    display: flex;
  }

  .sidebar-group__time {
    margin-left: auto;
    flex: none;
    font-size: var(--tiny-font-size);
    color: var(--subtle-color);
  }

  .sidebar-group__preview {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .sidebar-group--active .sidebar-group__preview {
    color: var(--body-color);
  }

  .sidebar-group--unread .sidebar-group__time {
    color: var(--muted-color);
    font-weight: 600;
  }

  .sidebar-group--unread .sidebar-group__preview {
    color: var(--muted-color);
  }

  .sidebar-group__badge {
    min-width: 18px;
    height: 18px;
    padding: 0 5px 1px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: var(--brand-color);
    color: var(--on-brand-color);
    font-size: var(--tiny-font-size);
    font-weight: 700;
  }
</style>
