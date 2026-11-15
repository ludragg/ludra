<script lang="ts">
  import { tick } from "svelte";
  import { Avatar } from "@/components";
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import EyeButton from "@/components/eye-button/eye-button.svelte";
  import UserMenu from "@/components/user-menu/user-menu.svelte";
  import { callSummary, isCall } from "@/helpers/call-summary";
  import { eventSummary, groupCallSummary, isEvent } from "@/helpers/group-summary";
  import { formatDay, formatTime, sameDay, toDate } from "@/helpers/time";
  import { t } from "@/i18n";
  import { CallOutcome, ConversationKind, MessageEvent, type Message } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";

  type Group = {
    key: string;
    day: string | null;
    senderId: string;
    time: string;
    messages: Message[];
    call: Message | null;
    event: Message | null;
  };

  const groupGap = 5 * 60 * 1000;

  let list: HTMLElement;
  let pinned = true;
  let lastSeen: string | undefined;
  let revealed = $state<Record<string, boolean>>({});
  let menu = $state<{ user: { id: string; username: string }; x: number; y: number } | null>(null);

  function openMenu(event: MouseEvent, user: { id: string; username: string }) {
    if (user.id === chat.user?.id || user.username === "?") {
      return;
    }
    event.preventDefault();
    menu = { user, x: event.clientX, y: event.clientY };
  }

  const thread = $derived(chat.thread);
  const groups = $derived(group(thread?.messages ?? []));
  const isGroup = $derived(chat.active?.kind === ConversationKind.GROUP);
  const myId = $derived(chat.user?.id ?? "");
  const nameOf = (userId: string) => chat.nameOf(userId);

  $effect(() => {
    const last = thread?.messages.at(-1);
    if (!last || last.id === lastSeen) {
      return;
    }

    if (pinned || last.senderId === chat.user?.id) {
      list.scrollTop = list.scrollHeight;
    }
    lastSeen = last.id;
  });

  function group(messages: Message[]): Group[] {
    const groups: Group[] = [];
    let previous: { message: Message; date: Date } | undefined;

    for (const message of messages) {
      const date = toDate(message.sentAt);
      const newDay = !previous || !sameDay(previous.date, date);
      const continues =
        previous &&
        !newDay &&
        !isCall(message) &&
        !isCall(previous.message) &&
        !isEvent(message) &&
        !isEvent(previous.message) &&
        previous.message.senderId === message.senderId &&
        date.getTime() - previous.date.getTime() < groupGap;

      if (continues) {
        groups[groups.length - 1].messages.push(message);
      } else {
        groups.push({
          key: message.id,
          day: newDay ? formatDay(date) : null,
          senderId: message.senderId,
          time: formatTime(date),
          messages: [message],
          call: isCall(message) ? message : null,
          event: isEvent(message) ? message : null,
        });
      }
      previous = { message, date };
    }

    return groups;
  }

  function sender(id: string, name: string) {
    const person =
      id === chat.user?.id
        ? chat.user
        : chat.active?.peer?.id === id
          ? chat.active.peer
          : chat.active?.members.find((member) => member.id === id);
    return { id, username: person?.username ?? (name || chat.nameOf(id)), avatar: person?.avatar ?? "" };
  }

  async function onscroll() {
    pinned = list.scrollHeight - list.scrollTop - list.clientHeight < 80;

    if (list.scrollTop < 120 && thread?.hasMore && !thread.loading) {
      const height = list.scrollHeight;
      await chat.loadOlder();
      await tick();
      list.scrollTop += list.scrollHeight - height;
    }
  }
</script>

<section class="chat-messages" aria-label={t("chat.messages")} bind:this={list} {onscroll}>
  {#if thread && !thread.loading && thread.messages.length === 0}
    <p class="chat-messages__empty">{t("chat.empty")}</p>
  {/if}

  {#each groups as group (group.key)}
    {#if group.day}
      <div class="chat-messages__day">{group.day}</div>
    {/if}
    {#if group.event}
      <p class="chat-messages__event">
        <svg
          class="chat-messages__event-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          {#if group.event.event === MessageEvent.OWNER_CHANGED}
            <path d="M2 18h20l-2-11-5 4-3-7-3 7-5-4z" />
          {:else if group.event.event === MessageEvent.MEMBER_ADDED}
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6M22 11h-6" />
          {:else}
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 11h-6" />
          {/if}
        </svg>
        {eventSummary(group.event, myId, nameOf)}
        <time class="chat-messages__time">{group.time}</time>
      </p>
    {:else if group.call}
      {@const missed = group.call.callOutcome === CallOutcome.DECLINED || group.call.callOutcome === CallOutcome.MISSED}
      <p
        class="chat-messages__call"
        class:chat-messages__call--missed={missed}
        class:chat-messages__call--ongoing={group.call.callOutcome === CallOutcome.ONGOING}
      >
        <span class="chat-messages__call-icon"><CallIcon name={missed ? "hangUp" : "phone"} /></span>
        {isGroup
          ? groupCallSummary(group.call, myId, nameOf)
          : callSummary(group.call, myId, chat.active?.peer?.username ?? "")}
        <time class="chat-messages__time">{group.time}</time>
      </p>
    {:else}
      {@const who = sender(group.senderId, group.messages[0].senderName)}
      <article class="chat-messages__group">
        <span class="chat-messages__avatar" role="presentation" oncontextmenu={(event) => openMenu(event, who)}>
          <Avatar user={who} />
        </span>
        <div class="chat-messages__content">
          <header class="chat-messages__meta">
            <span class="chat-messages__author" role="presentation" oncontextmenu={(event) => openMenu(event, who)}>
              {who.username}
            </span>
            <time class="chat-messages__time">{group.time}</time>
          </header>
          {#each group.messages as message (message.id)}
            {#if chat.isBlocked(message.senderId)}
              {@const shown = revealed[message.id] === true}
              <p class="chat-messages__text chat-messages__text--blocked">
                {#if shown}
                  <span>{message.content}</span>
                {:else}
                  <span class="chat-messages__censored">{t("chat.blockedMessage")}</span>
                {/if}
                <EyeButton
                  {shown}
                  show="chat.revealMessage"
                  hide="chat.hideMessage"
                  ontoggle={() => (revealed[message.id] = !shown)}
                />
              </p>
            {:else}
              <p class="chat-messages__text">{message.content}</p>
            {/if}
          {/each}
        </div>
      </article>
    {/if}
  {/each}
</section>

{#if menu}
  <UserMenu user={menu.user} x={menu.x} y={menu.y} onclose={() => (menu = null)} />
{/if}

<style>
  .chat-messages {
    flex-grow: 1;
    padding: var(--page-gutter);
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
  }

  .chat-messages__empty {
    margin: auto;
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  .chat-messages__day {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .chat-messages__day::before,
  .chat-messages__day::after {
    content: "";
    flex-grow: 1;
    height: 1px;
    background: var(--border-color);
  }

  .chat-messages__day:first-child {
    margin-top: auto;
  }

  .chat-messages__call {
    margin: 0;
    padding-left: 48px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--body-color);
  }

  .chat-messages__call--ongoing {
    color: var(--success-color);
  }

  .chat-messages__call--missed {
    color: #f6746b;
  }

  .chat-messages__event {
    margin: 0;
    padding-left: 48px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  .chat-messages__event-icon {
    width: 14px;
    flex: none;
  }

  .chat-messages__call-icon {
    width: 16px;
    height: 16px;
    flex: none;
  }

  .chat-messages__group {
    display: flex;
    gap: 12px;
  }

  .chat-messages__content {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .chat-messages__meta {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .chat-messages__avatar {
    display: flex;
    align-self: flex-start;
  }

  .chat-messages__author {
    font-weight: 600;
    color: var(--muted-color);
  }

  .chat-messages__time {
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .chat-messages__text {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .chat-messages__text--blocked {
    margin: -6px 0;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .chat-messages__censored {
    font-style: italic;
    color: var(--subtle-color);
  }
</style>
