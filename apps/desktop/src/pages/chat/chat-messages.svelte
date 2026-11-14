<script lang="ts">
  import { tick } from "svelte";
  import { Avatar } from "@/components";
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import { callSummary, isCall } from "@/helpers/call-summary";
  import { formatDay, formatTime, sameDay, toDate } from "@/helpers/time";
  import { t } from "@/i18n";
  import { CallOutcome, type Message } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";

  type Group = {
    key: string;
    day: string | null;
    senderId: string;
    time: string;
    messages: Message[];
    call: Message | null;
  };

  const groupGap = 5 * 60 * 1000;

  let list: HTMLElement;
  let pinned = true;
  let lastSeen: string | undefined;

  const thread = $derived(chat.thread);
  const groups = $derived(group(thread?.messages ?? []));

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
        });
      }
      previous = { message, date };
    }

    return groups;
  }

  function sender(id: string) {
    const person = id === chat.user?.id ? chat.user : chat.active?.peer;
    return { id, username: person?.username ?? "?", avatar: person?.avatar ?? "" };
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
    {#if group.call}
      {@const missed = group.call.callOutcome === CallOutcome.DECLINED || group.call.callOutcome === CallOutcome.MISSED}
      <p
        class="chat-messages__call"
        class:chat-messages__call--missed={missed}
        class:chat-messages__call--ongoing={group.call.callOutcome === CallOutcome.ONGOING}
      >
        <span class="chat-messages__call-icon"><CallIcon name={missed ? "hangUp" : "phone"} /></span>
        {callSummary(group.call, chat.user?.id ?? "", chat.active?.peer?.username ?? "")}
        <time class="chat-messages__time">{group.time}</time>
      </p>
    {:else}
      {@const who = sender(group.senderId)}
      <article class="chat-messages__group">
        <Avatar user={who} />
        <div class="chat-messages__content">
          <header class="chat-messages__meta">
            <span class="chat-messages__author">{who.username}</span>
            <time class="chat-messages__time">{group.time}</time>
          </header>
          {#each group.messages as message (message.id)}
            <p class="chat-messages__text">{message.content}</p>
          {/each}
        </div>
      </article>
    {/if}
  {/each}
</section>

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
</style>
