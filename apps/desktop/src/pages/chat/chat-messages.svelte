<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { Avatar } from "@/components";
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import ChatImage from "@/components/chat-image/chat-image.svelte";
  import EyeButton from "@/components/eye-button/eye-button.svelte";
  import FileCard from "@/components/file-card/file-card.svelte";
  import MediaGallery from "@/components/media-gallery/media-gallery.svelte";
  import ImageViewer from "@/components/image-viewer/image-viewer.svelte";
  import LinkPreview from "@/components/link-preview/link-preview.svelte";
  import UserMenu from "@/components/user-menu/user-menu.svelte";
  import { callSummary, isCall } from "@/helpers/call-summary";
  import { Elapsed } from "@/helpers/duration.svelte";
  import { extensionFor, fileMessages, isMediaFile } from "@/helpers/files";
  import { openExternal } from "@/helpers/external";
  import { eventSummary, groupCallSummary, isEvent } from "@/helpers/group-summary";
  import { clean, markup } from "@/helpers/text";
  import { formatDay, formatTime, sameDay, toDate } from "@/helpers/time";
  import { t } from "@/i18n";
  import {
    CallOutcome,
    ConversationKind,
    MessageEvent,
    MessageKind,
    type ImageRef,
    type Message,
    type ReplyRef,
  } from "@/protocol/ludra/v1/models_pb";
  import { calls } from "@/stores/call.svelte";
  import { chat } from "@/stores/chat.svelte";
  import { files } from "@/stores/files.svelte";

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
  let editing = $state<{ id: string; content: string } | null>(null);
  let armed = $state<string | null>(null);
  let flashed = $state<string | null>(null);
  const elapsed = new Elapsed();
  onDestroy(() => elapsed.stop());

  let viewing = $state<{ image: ImageRef; name: string; label: string } | null>(null);

  async function saveImage(image: ImageRef, name: string): Promise<string | null> {
    const { data, mime } = await chat.imageFile(image.id);
    return files.saveBytes(`${name}.${extensionFor(mime)}`, data);
  }

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
  const owner = $derived(isGroup && chat.active?.ownerId === myId);
  const mentionable = $derived(
    new Set(
      (isGroup ? (chat.active?.members ?? []) : [chat.active?.peer, chat.user])
        .filter((person) => person !== undefined && person !== null)
        .map((person) => person.username.toLowerCase()),
    ),
  );

  function editable(message: Message): boolean {
    return message.kind === MessageKind.TEXT && message.senderId === myId;
  }

  function deletable(message: Message): boolean {
    return (
      (message.kind === MessageKind.TEXT || message.kind === MessageKind.IMAGE || message.kind === MessageKind.FILE) &&
      (message.senderId === myId || owner)
    );
  }

  function replyable(message: Message): boolean {
    return (
      (message.kind === MessageKind.TEXT || message.kind === MessageKind.IMAGE || message.kind === MessageKind.FILE) &&
      !chat.isBlocked(message.senderId)
    );
  }

  function quoted(reply: ReplyRef): string {
    if (chat.isBlocked(reply.senderId)) {
      return t("chat.blockedMessage");
    }
    const live = thread?.messages.find(({ id }) => id === reply.messageId);
    if (live?.kind === MessageKind.TEXT) {
      return live.content;
    }
    if (reply.voice) {
      return t("chat.voiceMessage");
    }
    if (reply.kind === MessageKind.IMAGE) {
      return t("chat.photo");
    }
    if (reply.kind === MessageKind.FILE) {
      return t("chat.file");
    }
    return reply.excerpt;
  }

  async function jump(messageId: string) {
    const target = list.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (!target) {
      return;
    }
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    flashed = messageId;
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
    if (flashed === messageId) {
      flashed = null;
    }
  }

  function edited(message: Message): string {
    const date = toDate(message.editedAt);
    return t("chat.editedAt", { day: formatDay(date), time: formatTime(date) });
  }

  function mentionsMe(message: Message): boolean {
    const me = chat.user?.username.toLowerCase();
    return (
      message.kind === MessageKind.TEXT &&
      ((me !== undefined && markup(message.content, new Set([me])).some((span) => span.mention)) ||
        (message.reply !== undefined && message.reply.senderId === myId))
    );
  }

  function liveStart(message: Message): number | null {
    if (message.callOutcome !== CallOutcome.ONGOING) {
      return null;
    }
    if (isGroup) {
      const started = chat.active?.call?.startedAt;
      return started ? toDate(started).getTime() : null;
    }
    const current = calls.current;
    return current?.startedAt && current.peer.id === chat.active?.peer?.id ? current.startedAt : null;
  }

  function view(message: Message, image: ImageRef) {
    const name = sender(message.senderId, message.senderName).username;
    viewing = { image, name: `ludra-${message.id.slice(-12)}`, label: t("chat.photoBy", { name }) };
  }

  function startEdit(message: Message) {
    armed = null;
    editing = { id: message.id, content: message.content };
  }

  async function saveEdit(event: SubmitEvent, message: Message) {
    event.preventDefault();
    const content = clean(editing?.content ?? "");
    editing = null;
    if (!content || content === message.content) {
      return;
    }
    await chat.editMessage(message.id, content).catch(() => undefined);
  }

  function editKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      editing = null;
    }
  }

  async function remove(message: Message) {
    if (armed !== message.id) {
      armed = message.id;
      return;
    }
    armed = null;
    await chat.deleteMessage(message.id).catch(() => undefined);
  }

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
        !message.reply &&
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

{#snippet body(content: string)}
  {#each markup(content, mentionable) as span}
    {#if span.href}
      <a class="chat-messages__link" href={span.href} target="_blank" rel="noreferrer" onclick={openExternal}>
        {span.text}
      </a>
    {:else if span.mention}
      <span class="chat-messages__mention">{span.text}</span>
    {:else}
      {span.text}
    {/if}
  {/each}
{/snippet}

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
          {:else if group.event.event === MessageEvent.GROUP_RENAMED}
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
          {:else if group.event.event === MessageEvent.PHOTO_CHANGED || group.event.event === MessageEvent.PHOTO_REMOVED}
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
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
        {#if liveStart(group.call) !== null}
          <span class="chat-messages__call-timer">{elapsed.format(liveStart(group.call)!)}</span>
        {/if}
        <time class="chat-messages__time">{group.time}</time>
      </p>
    {:else}
      {@const who = sender(group.senderId, group.messages[0].senderName)}
      {@const reply = group.messages[0].reply}
      {#if reply}
        {@const replied = sender(reply.senderId, "")}
        <button
          type="button"
          class="chat-messages__reply"
          aria-label={t("chat.replyOpen")}
          onclick={() => jump(reply.messageId)}
        >
          <span class="chat-messages__reply-avatar"><Avatar user={replied} size="fill" /></span>
          <span class="chat-messages__reply-author">{replied.username}</span>
          <span class="chat-messages__reply-text">{quoted(reply)}</span>
        </button>
      {/if}
      <article class="chat-messages__group" class:chat-messages__group--replying={reply}>
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
            <div
              class="chat-messages__message"
              data-message-id={message.id}
              class:chat-messages__message--flash={flashed === message.id}
              class:chat-messages__message--editing={editing?.id === message.id}
              class:chat-messages__message--mentioned={mentionsMe(message)}
            >
              {#if editing?.id === message.id}
                <form class="chat-messages__edit" onsubmit={(event) => saveEdit(event, message)}>
                  <input
                    class="chat-messages__edit-input"
                    aria-label={t("chat.editMessage")}
                    maxlength="4000"
                    autocomplete="off"
                    bind:value={editing.content}
                    onkeydown={editKey}
                    {@attach (input) => input.focus()}
                  />
                  <span class="chat-messages__edit-hint">
                    {t("chat.escapeTo")}
                    <button type="button" class="chat-messages__edit-link" onclick={() => (editing = null)}>
                      {t("chat.cancelEdit")}
                    </button>
                    · {t("chat.enterTo")}
                    <button type="submit" class="chat-messages__edit-link">{t("chat.saveEdit")}</button>
                  </span>
                </form>
              {:else if chat.isBlocked(message.senderId)}
                {@const shown = revealed[message.id] === true}
                <p class="chat-messages__text chat-messages__text--blocked">
                  {#if shown && message.image}
                    <ChatImage
                      image={message.image}
                      label={t("chat.openPhoto")}
                      onopen={() => view(message, message.image!)}
                    />
                  {:else if shown}
                    <span>{@render body(message.content)}</span>
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
              {:else if message.kind === MessageKind.IMAGE && message.image}
                {@const image = message.image}
                <div class="chat-messages__photo">
                  {#if image.expired}
                    <p class="chat-messages__expired">{t("chat.photoExpired")}</p>
                  {:else}
                    <ChatImage {image} label={t("chat.openPhoto")} onopen={() => view(message, image)} />
                  {/if}
                </div>
              {:else if message.kind === MessageKind.FILE && message.file}
                {@const items = fileMessages(message)}
                {@const media = items.filter((item) => isMediaFile(item.file!))}
                {#if message.content}
                  <p class="chat-messages__text">{@render body(message.content)}</p>
                {/if}
                {#if media.length === 1}
                  <FileCard message={media[0]} sender={who.username} mine={message.senderId === myId} />
                {:else if media.length > 1}
                  <MediaGallery items={media} mine={message.senderId === myId} />
                {/if}
                {#each items.filter((item) => !isMediaFile(item.file!)) as item (item.id)}
                  <FileCard message={item} sender={who.username} mine={message.senderId === myId} />
                {/each}
              {:else}
                <p class="chat-messages__text">
                  {@render body(message.content)}
                  {#if message.editedAt}
                    <span class="chat-messages__edited" data-tooltip={edited(message)}>{t("chat.edited")}</span>
                  {/if}
                </p>
                {#if message.preview}
                  <LinkPreview
                    preview={message.preview}
                    onremove={message.senderId === myId ? () => chat.removePreview(message.id) : undefined}
                  />
                {/if}
              {/if}
              {#if editing?.id !== message.id && (replyable(message) || editable(message) || deletable(message))}
                <div class="chat-messages__actions" role="toolbar" aria-label={t("chat.messageActions")}>
                  {#if replyable(message)}
                    <button
                      type="button"
                      class="chat-messages__action"
                      aria-label={t("chat.reply")}
                      data-tooltip={t("chat.reply")}
                      onclick={() => chat.reply(message)}
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
                        <path d="M9 14L4 9l5-5" />
                        <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                      </svg>
                    </button>
                  {/if}
                  {#if editable(message)}
                    <button
                      type="button"
                      class="chat-messages__action"
                      aria-label={t("chat.editMessage")}
                      data-tooltip={t("chat.editMessage")}
                      onclick={() => startEdit(message)}
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
                        <path d="M4 20h4L19 9l-4-4L4 16z" />
                        <path d="m13.5 6.5 4 4" />
                      </svg>
                    </button>
                  {/if}
                  {#if deletable(message)}
                    <button
                      type="button"
                      class="chat-messages__action chat-messages__action--delete"
                      class:chat-messages__action--armed={armed === message.id}
                      aria-label={armed === message.id ? t("chat.confirmDelete") : t("chat.deleteMessage")}
                      data-tooltip={armed === message.id ? t("chat.confirmDelete") : t("chat.deleteMessage")}
                      onclick={() => remove(message)}
                      onpointerleave={() => {
                        if (armed === message.id) {
                          armed = null;
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
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                      </svg>
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </article>
    {/if}
  {/each}
</section>

{#if menu}
  <UserMenu user={menu.user} x={menu.x} y={menu.y} onclose={() => (menu = null)} />
{/if}

{#if viewing}
  {@const current = viewing}
  <ImageViewer
    load={() => chat.image(current.image.id)}
    label={current.label}
    save={() => saveImage(current.image, current.name)}
    onclose={() => (viewing = null)}
  />
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

  .chat-messages__call-timer {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .chat-messages__group {
    display: flex;
    gap: 12px;
  }

  .chat-messages__reply {
    position: relative;
    max-width: calc(100% - 48px);
    margin: 0 0 -12px 48px;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    border: 0;
    background: transparent;
    font-size: var(--small-font-size);
    line-height: 1.3;
    color: var(--subtle-color);
    text-align: left;
  }

  .chat-messages__reply::before {
    content: "";
    position: absolute;
    top: 50%;
    left: -30px;
    width: 24px;
    height: 10px;
    border-top: 2px solid var(--border-color);
    border-left: 2px solid var(--border-color);
    border-top-left-radius: 8px;
  }

  .chat-messages__reply:hover .chat-messages__reply-text {
    color: var(--muted-color);
  }

  .chat-messages__reply-avatar {
    --size: 25px;
    width: 16px;
    height: 16px;
    flex: none;
    display: flex;
  }

  .chat-messages__reply-author {
    flex: none;
    font-weight: 600;
    color: var(--body-color);
  }

  .chat-messages__reply-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-messages__message--flash,
  .chat-messages__message--flash:hover {
    background: color-mix(in srgb, var(--brand-color) 18%, transparent);
    transition: background ease 0.3s;
  }

  .chat-messages__content {
    min-width: 0;
    flex: 1;
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

  .chat-messages__message {
    position: relative;
    margin: 0 -8px;
    padding: 0 8px;
    border-radius: 4px;
  }

  .chat-messages__message:hover,
  .chat-messages__message:focus-within {
    background: var(--surface-color);
  }

  .chat-messages__message--mentioned,
  .chat-messages__message--mentioned:hover,
  .chat-messages__message--mentioned:focus-within {
    border-radius: 0 4px 4px 0;
    background: color-mix(in srgb, var(--brand-color) 9%, transparent);
    box-shadow: inset 2px 0 0 var(--brand-color);
  }

  .chat-messages__message--editing,
  .chat-messages__message--editing:hover,
  .chat-messages__message--editing:focus-within {
    padding: 4px 8px;
    background: transparent;
  }

  .chat-messages__actions {
    position: absolute;
    top: -16px;
    right: 8px;
    z-index: 1;
    padding: 2px;
    display: none;
    gap: 2px;
    border-radius: 6px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .chat-messages__message:hover .chat-messages__actions,
  .chat-messages__message:focus-within .chat-messages__actions {
    display: flex;
  }

  .chat-messages__action {
    width: 28px;
    height: 28px;
    padding: 6px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--subtle-color);
    transition: all ease 0.1s;
  }

  .chat-messages__action:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .chat-messages__action--delete:hover {
    color: #f6746b;
  }

  .chat-messages__action--armed,
  .chat-messages__action--armed:hover {
    background: var(--danger-color);
    color: var(--muted-color);
  }

  .chat-messages__edited {
    margin-left: 4px;
    font-size: var(--tiny-font-size);
    color: var(--subtle-color);
  }

  .chat-messages__edit {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .chat-messages__edit-input {
    height: 38px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    outline: 0;
    background: var(--dark-background-color);
    color: var(--muted-color);
  }

  .chat-messages__edit-hint {
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .chat-messages__edit-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--brand-color);
    font-size: inherit;
  }

  .chat-messages__edit-link:hover {
    text-decoration: underline;
  }

  .chat-messages__photo {
    padding: 4px 0;
  }

  .chat-messages__mention {
    padding: 0 3px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--brand-color) 18%, transparent);
    color: color-mix(in srgb, var(--brand-color) 45%, #ffffff);
    font-weight: 500;
  }

  .chat-messages__expired {
    margin: 0;
    font-style: italic;
    color: var(--subtle-color);
  }

  .chat-messages__text {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .chat-messages__link {
    color: var(--brand-color);
    text-decoration: none;
  }

  .chat-messages__link:hover {
    text-decoration: underline;
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
