<script lang="ts">
  import { tick } from "svelte";
  import { Avatar } from "@/components";
  import { formatDay, formatTime, sameDay, toDate } from "@/helpers/time";
  import type { Message } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";

  type Group = {
    key: string;
    day: string | null;
    senderId: string;
    time: string;
    messages: Message[];
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
        });
      }
      previous = { message, date };
    }

    return groups;
  }

  function sender(id: string) {
    const name = id === chat.user?.id ? chat.user.username : chat.active?.peer?.username;
    return { id, name: name ?? "?" };
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

<section class="chat-messages" aria-label="Mensagens" bind:this={list} {onscroll}>
  {#if thread && !thread.loading && thread.messages.length === 0}
    <p class="chat-messages__empty">Nenhuma mensagem ainda. Diga oi!</p>
  {/if}

  {#each groups as group (group.key)}
    {#if group.day}
      <div class="chat-messages__day">{group.day}</div>
    {/if}
    {@const who = sender(group.senderId)}
    <article class="chat-messages__group">
      <Avatar id={who.id} name={who.name} />
      <div class="chat-messages__content">
        <header class="chat-messages__meta">
          <span class="chat-messages__author">{who.name}</span>
          <time class="chat-messages__time">{group.time}</time>
        </header>
        {#each group.messages as message (message.id)}
          <p class="chat-messages__text">{message.content}</p>
        {/each}
      </div>
    </article>
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
