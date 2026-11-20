<script lang="ts">
  import { onDestroy } from "svelte";
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import GroupAvatar from "@/components/group-avatar/group-avatar.svelte";
  import { isCall } from "@/helpers/call-summary";
  import { Elapsed } from "@/helpers/duration.svelte";
  import { eventSummary, groupCallSummary, isEvent } from "@/helpers/group-summary";
  import { applyMask } from "@/helpers/mask";
  import { clean } from "@/helpers/text";
  import { formatRecent, toDate } from "@/helpers/time";
  import { t } from "@/i18n";
  import type { Conversation } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";
  import SidebarGroupMenu from "./sidebar-group-menu.svelte";

  let { conversation, active, tag = "" }: { conversation: Conversation; active: boolean; tag?: string } = $props();

  let menu = $state<{ x: number; y: number } | null>(null);
  let picker = $state<HTMLInputElement>();
  let renaming = $state(false);
  let draft = $state("");
  let renameError = $state(false);
  let saving = false;

  function startRename() {
    draft = conversation.name;
    renameError = false;
    renaming = true;
  }

  async function saveRename(event?: FocusEvent) {
    const name = clean(draft);
    if (saving || !renaming) {
      return;
    }
    if (!name || name === conversation.name) {
      renaming = false;
      return;
    }
    saving = true;
    try {
      await chat.renameGroup(conversation.id, name);
      renaming = false;
    } catch {
      renameError = true;
      renaming = !event;
    } finally {
      saving = false;
    }
  }

  function renameKey(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      saveRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      renaming = false;
    }
  }

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

{#if renaming}
  <div class="sidebar-group sidebar-group--renaming" class:sidebar-group--active={active}>
    <GroupAvatar id={conversation.id} avatar={conversation.avatar} />
    <input
      class="sidebar-group__input"
      class:sidebar-group__input--error={renameError}
      aria-label={t("group.name")}
      aria-invalid={renameError}
      data-tooltip={renameError ? t("group.renameFailed") : undefined}
      maxlength={50}
      value={draft}
      oninput={(event) => {
        const input = event.currentTarget;
        draft = applyMask(input.value, "groupName");
        input.value = draft;
        renameError = false;
      }}
      onkeydown={renameKey}
      onblur={saveRename}
      {@attach (input) => {
        input.focus();
        input.select();
      }}
    />
  </div>
{:else}
  <button
    class="sidebar-group"
    class:sidebar-group--active={active}
    class:sidebar-group--unread={unread > 0}
    aria-current={active ? "page" : undefined}
    onclick={() => chat.select(conversation.id)}
    oncontextmenu={openMenu}
  >
    <span class="sidebar-group__avatar-wrap">
      <GroupAvatar id={conversation.id} avatar={conversation.avatar} size="large" />
      {#if active || unread > 0}
        <span class="sidebar-group__avatar-dot" aria-hidden="true"></span>
      {/if}
    </span>
    <span class="sidebar-group__body">
      <span class="sidebar-group__row">
        <span class="sidebar-group__name">{conversation.name}</span>
        {#if unread === 0 && tag}
          <span class="sidebar-group__tag" title={tag}>{tag}</span>
        {:else if unread === 0 && last}
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
      </span>
    </span>
    {#if unread > 0}
      <span class="sidebar-group__badge" aria-label={t("sidebar.unread", { count: unread })}>{unread}</span>
    {/if}
  </button>
{/if}

{#if menu}
  <SidebarGroupMenu
    group={conversation}
    x={menu.x}
    y={menu.y}
    onphoto={() => picker?.click()}
    onrename={startRename}
    onclose={() => (menu = null)}
  />
{/if}
<input bind:this={picker} class="sr-only" type="file" accept="image/png" tabindex="-1" onchange={pick} />

<style>
  .sidebar-group {
    position: relative;
    width: 100%;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #ffffff;
    text-align: left;
    line-height: 1.35;
    overflow: hidden;
    transition:
      background 150ms ease,
      color 150ms ease;
  }

  .sidebar-group:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .sidebar-group--active,
  .sidebar-group--active:hover {
    background: rgba(139, 92, 246, 0.15);
  }

  .sidebar-group--active::before {
    content: "";
    position: absolute;
    left: 0;
    top: 4px;
    bottom: 4px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: #8b5cf6;
  }

  .sidebar-group__avatar-wrap {
    position: relative;
    flex: none;
    display: inline-flex;
    border-radius: 50%;
  }

  .sidebar-group--active .sidebar-group__avatar-wrap {
    box-shadow: 0 0 0 1.5px #8b5cf6;
  }

  .sidebar-group__avatar-dot {
    position: absolute;
    top: -1px;
    right: -1px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #8b5cf6;
    border: 2px solid #0b0b0f;
  }

  .sidebar-group--renaming,
  .sidebar-group--renaming:hover {
    background: var(--active-color);
  }

  .sidebar-group__input {
    min-width: 0;
    flex-grow: 1;
    padding: 6px 8px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--dark-background-color);
    color: var(--muted-color);
    font: inherit;
    font-weight: 600;
    outline: none;
  }

  .sidebar-group__input:focus {
    border-color: var(--brand-color);
  }

  .sidebar-group__input--error,
  .sidebar-group__input--error:focus {
    border-color: var(--error-color);
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
    font-size: 11px;
    color: #9ca3af;
  }

  .sidebar-group__tag {
    max-width: 52px;
    margin-left: auto;
    padding: 1px 6px;
    flex: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
    color: #9ca3af;
    font-size: 10px;
    font-weight: 500;
    line-height: 1.4;
  }

  .sidebar-group__preview {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--small-font-size);
    color: #9ca3af;
  }

  .sidebar-group--active .sidebar-group__name {
    color: #ffffff;
    font-weight: 700;
  }

  .sidebar-group--active .sidebar-group__preview {
    color: #d1d5db;
  }

  .sidebar-group--unread .sidebar-group__time {
    color: #ffffff;
    font-weight: 600;
  }

  .sidebar-group--unread .sidebar-group__preview {
    color: #d1d5db;
  }

  .sidebar-group__badge {
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: #8b5cf6;
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }
</style>
