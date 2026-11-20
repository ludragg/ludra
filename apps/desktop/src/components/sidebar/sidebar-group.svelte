<script lang="ts">
  import { onDestroy } from "svelte";
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import GroupAvatar from "@/components/group-avatar/group-avatar.svelte";
  import MentionText from "@/components/mention-text/mention-text.svelte";
  import { isCall } from "@/helpers/call-summary";
  import { Elapsed } from "@/helpers/duration.svelte";
  import { eventSummary, groupCallSummary, isEvent } from "@/helpers/group-summary";
  import { avatarTypes } from "@/helpers/image";
  import { applyMask } from "@/helpers/mask";
  import { messageText } from "@/helpers/message-text";
  import { clean } from "@/helpers/text";
  import { formatRecent, toDate } from "@/helpers/time";
  import { t } from "@/i18n";
  import type { Conversation } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";
  import SidebarGroupMenu from "./sidebar-group-menu.svelte";

  let { conversation, active }: { conversation: Conversation; active: boolean } = $props();

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
  const mentioned = $derived(chat.mentions[conversation.id] === true);
  const names = $derived(new Set(conversation.members.map((member) => member.username.toLowerCase())));
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
            ? t("sidebar.youSaid", { content: messageText(last) })
            : chat.isBlocked(last.senderId)
              ? t("chat.blockedMessage")
              : t("sidebar.memberSaid", { name: last.senderName || nameOf(last.senderId), content: messageText(last) }),
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
    class:sidebar-group--unread={unread > 0 || mentioned}
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
          <span class="sidebar-group__preview"><MentionText text={preview} {names} /></span>
        {/if}
        {#if mentioned}
          <span class="sidebar-group__mention" aria-label={t("sidebar.mentioned")}>@</span>
        {:else if unread > 0}
          <span class="sidebar-group__badge" aria-label={t("sidebar.unread", { count: unread })}>{unread}</span>
        {/if}
      </span>
    </span>
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
<input bind:this={picker} class="sr-only" type="file" accept={avatarTypes.join(",")} tabindex="-1" onchange={pick} />

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
    font-size: var(--tiny-font-size);
    color: var(--subtle-color);
  }

  .sidebar-group__preview {
    margin: -1px 0;
    padding: 1px 0;
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

  .sidebar-group__mention {
    padding: 0 2px;
    flex: none;
    color: var(--neon-color);
    font-size: 15px;
    font-weight: 800;
    line-height: 1;
    text-shadow: 0 0 3px color-mix(in srgb, var(--neon-color) 45%, transparent);
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
    color: var(--dark-background-color);
    font-size: var(--tiny-font-size);
    font-weight: 700;
  }
</style>
