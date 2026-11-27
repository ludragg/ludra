<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { tick } from "svelte";
  import { Avatar, Button } from "@/components";
  import AttachmentTray from "@/components/attachment-tray/attachment-tray.svelte";
  import GifPicker from "@/components/gif-picker/gif-picker.svelte";
  import VoiceRecorder from "@/components/voice-recorder/voice-recorder.svelte";
  import type { Picked } from "@/helpers/files";
  import { clean, markup } from "@/helpers/text";
  import { t } from "@/i18n";
  import { ConversationKind, type User } from "@/protocol/ludra/v1/models_pb";
  import type { Gif } from "@/protocol/ludra/v1/server_pb";
  import type { Recording } from "@/services/voice-recorder";
  import { chat } from "@/stores/chat.svelte";

  let { recipient }: { recipient: string } = $props();

  let content = $state("");
  let menuOpen = $state(false);
  let voiceOpen = $state(false);
  let attach = $state<HTMLElement>();
  let gifOpen = $state(false);
  let gifArea = $state<HTMLElement>();
  let input = $state<HTMLInputElement>();
  let mirror = $state<HTMLElement>();
  let mention = $state<{ start: number; query: string } | null>(null);
  let selected = $state(0);

  const mentionPattern = /(?:^|[\s(<[{"'])@([a-zA-Z0-9_.]{0,32})$/;
  const people = $derived(
    (chat.active?.kind === ConversationKind.GROUP ? chat.active.members : [chat.active?.peer, chat.user]).filter(
      (person): person is User => person !== undefined && person !== null,
    ),
  );
  const candidates = $derived.by(() => {
    if (!mention) {
      return [];
    }
    const query = mention.query.toLowerCase();
    const starts = people.filter(({ username }) => username.toLowerCase().startsWith(query));
    const contains = people.filter(
      ({ username }) => !username.toLowerCase().startsWith(query) && username.toLowerCase().includes(query),
    );
    return [...starts, ...contains].slice(0, 8);
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const text = clean(content);
    if (!text && chat.staged.length === 0) {
      return;
    }

    content = "";
    if (chat.staged.length > 0) {
      if (!(await chat.sendStaged(text))) {
        content = text;
      }
      return;
    }
    try {
      await chat.send(text);
    } catch {
      content = text;
    }
  }

  const names = $derived(new Set(people.map(({ username }) => username.toLowerCase())));

  function sync() {
    if (mirror && input) {
      mirror.scrollLeft = input.scrollLeft;
    }
  }

  function detect() {
    const caret = input?.selectionStart ?? content.length;
    const match = content.slice(0, caret).match(mentionPattern);
    mention = match ? { start: caret - match[1].length - 1, query: match[1] } : null;
    selected = 0;
  }

  async function choose(person: User) {
    if (!mention || !input) {
      return;
    }
    const caret = input.selectionStart ?? content.length;
    const before = content.slice(0, mention.start);
    const insert = `@${person.username} `;
    content = before + insert + content.slice(caret).replace(/^ /, "");
    mention = null;
    await tick();
    const position = before.length + insert.length;
    input.focus();
    input.setSelectionRange(position, position);
    sync();
  }

  function navigate(event: KeyboardEvent) {
    if (!mention || candidates.length === 0) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      selected = (selected + (event.key === "ArrowDown" ? 1 : candidates.length - 1)) % candidates.length;
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      void choose(candidates[selected]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      mention = null;
    }
  }

  function moved(event: KeyboardEvent) {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      detect();
    }
  }

  const uploading = $derived(chat.sending !== "");
  const replying = $derived(chat.replyTarget);
  let activeConversation = chat.activeId;

  $effect(() => {
    if (chat.activeId !== activeConversation) {
      activeConversation = chat.activeId;
      chat.clearStaged();
    }
  });

  $effect(() => {
    if (replying) {
      input?.focus();
    }
  });

  function toggleMenu() {
    chat.photoError = "";
    gifOpen = false;
    menuOpen = !menuOpen;
  }

  function toggleGifs() {
    chat.photoError = "";
    menuOpen = false;
    gifOpen = !gifOpen;
  }

  function pickGif(gif: Gif) {
    gifOpen = false;
    void chat.sendGif(gif.id);
  }

  function escape(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (!menuOpen && !gifOpen && !mention) {
        chat.cancelReply();
      }
      menuOpen = false;
      gifOpen = false;
    }
  }

  async function pick() {
    menuOpen = false;
    const picked = await invoke<Picked[]>("pick_files").catch(() => []);
    chat.stage(picked);
    input?.focus();
  }

  function record() {
    menuOpen = false;
    chat.photoError = "";
    voiceOpen = true;
  }

  function sendVoice({ blob, seconds }: Recording) {
    voiceOpen = false;
    void chat.sendVoice(blob, seconds);
  }

  function paste(event: ClipboardEvent) {
    const file = [...(event.clipboardData?.files ?? [])].find((entry) => entry.type.startsWith("image/"));
    if (file) {
      event.preventDefault();
      void chat.pasteImage(file);
    }
  }

  function outside(event: MouseEvent) {
    const target = event.target as Node;
    if (menuOpen && attach && !attach.contains(target)) {
      menuOpen = false;
    }
    if (gifOpen && gifArea && !gifArea.contains(target)) {
      gifOpen = false;
    }
  }
</script>

<svelte:window onclick={outside} onkeydown={escape} />

<div class="chat-composer">
  {#if candidates.length > 0}
    <div class="chat-composer__mentions" id="mention-list" role="listbox" aria-label={t("chat.members")}>
      <span class="chat-composer__mentions-title">{t("chat.members")}</span>
      {#each candidates as person, index (person.id)}
        <button
          type="button"
          role="option"
          class="chat-composer__mention"
          class:chat-composer__mention--selected={index === selected}
          aria-selected={index === selected}
          tabindex="-1"
          onmousedown={(event) => event.preventDefault()}
          onmouseenter={() => (selected = index)}
          onclick={() => choose(person)}
        >
          <Avatar user={person} size="small" />
          {person.username}
        </button>
      {/each}
    </div>
  {/if}
  {#if chat.sending || chat.photoError}
    <p class="chat-composer__status" class:chat-composer__status--error={chat.photoError} role="status">
      {chat.photoError || t("chat.sending", { name: chat.sending })}
    </p>
  {/if}
  {#if replying}
    <div class="chat-composer__reply">
      <span>{t("chat.replyingTo", { name: chat.nameOf(replying.senderId) })}</span>
      <button
        type="button"
        class="chat-composer__reply-close"
        aria-label={t("chat.cancelReply")}
        data-tooltip={t("chat.cancelReply")}
        onclick={() => chat.cancelReply()}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  {/if}
  {#if voiceOpen}
    <VoiceRecorder
      replying={replying !== null}
      onsend={sendVoice}
      oncancel={() => (voiceOpen = false)}
      onerror={() => (chat.photoError = t("chat.voiceFailed"))}
    />
  {:else}
    {#if chat.staged.length > 0}
      <AttachmentTray
        items={chat.staged}
        squared={replying !== null}
        onremove={(path) => chat.unstage(path)}
        oncensor={(path) => chat.toggleCensored(path)}
      />
    {/if}
    <form
      class="chat-composer__form"
      class:chat-composer__form--replying={replying || chat.staged.length > 0}
      onsubmit={submit}
    >
      <div class="chat-composer__attach" bind:this={attach}>
        <button
          type="button"
          class="chat-composer__plus"
          aria-label={t("chat.attach")}
          aria-expanded={menuOpen}
          disabled={uploading}
          onclick={toggleMenu}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.6"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M12 6v12M6 12h12" />
          </svg>
        </button>
        {#if menuOpen}
          <div class="chat-composer__menu" role="menu">
            <button type="button" role="menuitem" class="chat-composer__option" onclick={pick}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5" />
              </svg>
              {t("chat.files")}
            </button>
            <button type="button" role="menuitem" class="chat-composer__option" onclick={record}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
              {t("chat.recordVoice")}
            </button>
          </div>
        {/if}
      </div>
      <label for="message" class="sr-only">{t("chat.message")}</label>
      <div class="chat-composer__field">
        <div class="chat-composer__mirror" aria-hidden="true" bind:this={mirror}>
          {#each markup(content, names) as span}{#if span.mention}<span class="chat-composer__highlight"
                >{span.text}</span
              >{:else}{span.text}{/if}{/each}
        </div>
        <input
          id="message"
          class="chat-composer__input"
          bind:this={input}
          bind:value={content}
          placeholder={t("chat.messageTo", { name: recipient })}
          maxlength="4000"
          autocomplete="off"
          onpaste={paste}
          oninput={() => {
            chat.photoError = "";
            detect();
            sync();
          }}
          onkeydown={navigate}
          onkeyup={(event) => {
            moved(event);
            sync();
          }}
          onclick={() => {
            detect();
            sync();
          }}
          onscroll={sync}
          onblur={() => (mention = null)}
          role="combobox"
          aria-expanded={candidates.length > 0}
          aria-controls="mention-list"
          aria-autocomplete="list"
          {@attach (input) => input.focus()}
        />
      </div>
      <div class="chat-composer__gifs" bind:this={gifArea}>
        <button
          type="button"
          class="chat-composer__gif"
          class:chat-composer__gif--open={gifOpen}
          aria-label={t("chat.gif")}
          aria-expanded={gifOpen}
          data-tooltip={t("chat.gif")}
          disabled={uploading}
          onclick={toggleGifs}
        >
          GIF
        </button>
        {#if gifOpen}
          <div class="chat-composer__picker">
            <GifPicker onpick={pickGif} />
          </div>
        {/if}
      </div>
      <Button type="submit" size="small" disabled={!clean(content) && chat.staged.length === 0}>
        {t("chat.send")}
        <svg
          class="chat-composer__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </Button>
    </form>
  {/if}
</div>

<style>
  .chat-composer {
    position: relative;
    margin: 0 var(--page-gutter) var(--page-gutter);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .chat-composer__mentions {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + 8px);
    z-index: 10;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--dark-background-color);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .chat-composer__mentions-title {
    padding: 2px 8px 6px;
    font-size: var(--small-font-size);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--subtle-color);
  }

  .chat-composer__mention {
    padding: 6px 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted-color);
    text-align: left;
  }

  .chat-composer__mention--selected {
    background: var(--border-color);
  }

  .chat-composer__status {
    margin: 0;
    padding: 0 4px;
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .chat-composer__status--error {
    color: var(--error-color);
  }

  .chat-composer__form {
    padding: 4px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-radius: 8px;
    background: var(--dark-background-color);
    border: 1px solid var(--border-color);
    transition: border-color ease 0.2s;
  }

  .chat-composer__form--replying {
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }

  .chat-composer__reply {
    margin-bottom: -6px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--border-color);
    border-bottom: 0;
    border-radius: 8px 8px 0 0;
    background: var(--surface-color);
    font-size: 13px;
    color: var(--body-color);
  }

  .chat-composer__reply span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-composer__reply-close {
    width: 24px;
    height: 24px;
    flex: none;
    margin-left: auto;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--subtle-color);
  }

  .chat-composer__reply-close:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .chat-composer__reply-close svg {
    width: 16px;
  }

  .chat-composer__form:focus-within {
    border-color: rgba(255, 255, 255, 0.3);
  }

  .chat-composer__attach {
    position: relative;
    flex: none;
  }

  .chat-composer__plus {
    width: 24px;
    height: 24px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: var(--subtle-color);
    color: var(--on-brand-color);
    transition: background ease 0.15s;
  }

  .chat-composer__plus:not(:disabled):hover,
  .chat-composer__plus[aria-expanded="true"] {
    background: var(--muted-color);
  }

  .chat-composer__plus:disabled {
    opacity: var(--disabled-opacity);
  }

  .chat-composer__plus svg {
    width: 14px;
  }

  .chat-composer__menu {
    position: absolute;
    left: -10px;
    bottom: calc(100% + 14px);
    z-index: 10;
    width: 200px;
    padding: 6px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--dark-background-color);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .chat-composer__option {
    width: 100%;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted-color);
    text-align: left;
  }

  .chat-composer__option:hover {
    background: var(--border-color);
  }

  .chat-composer__option svg {
    width: 18px;
    flex: none;
  }

  .chat-composer__gifs {
    position: relative;
    flex: none;
  }

  .chat-composer__gif {
    height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--subtle-color);
    font-size: var(--tiny-font-size);
    font-weight: 800;
    letter-spacing: 0.04em;
    transition:
      background ease 0.15s,
      color ease 0.15s;
  }

  .chat-composer__gif:not(:disabled):hover,
  .chat-composer__gif--open {
    background: var(--border-color);
    color: var(--muted-color);
  }

  .chat-composer__gif:disabled {
    opacity: var(--disabled-opacity);
  }

  .chat-composer__picker {
    position: absolute;
    right: -96px;
    bottom: calc(100% + 14px);
    z-index: 10;
  }

  .chat-composer__field {
    position: relative;
    min-width: 0;
    height: 40px;
    flex-grow: 1;
  }

  .chat-composer__mirror {
    position: absolute;
    inset: 0;
    padding: 0 4px;
    overflow: hidden;
    color: var(--muted-color);
    line-height: 40px;
    white-space: pre;
    pointer-events: none;
  }

  .chat-composer__highlight {
    padding: 1px 3px;
    margin: -1px -3px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--brand-color) 22%, transparent);
    color: color-mix(in srgb, var(--brand-color) 45%, #ffffff);
  }

  .chat-composer__input {
    position: relative;
    width: 100%;
    height: 40px;
    padding: 0 4px;
    border: 0;
    outline: 0;
    background: transparent;
    color: transparent;
    caret-color: var(--muted-color);
  }

  .chat-composer__icon {
    width: 14px;
  }
</style>
