<script lang="ts">
  import { Button } from "@/components";
  import { chat } from "@/stores/chat.svelte";

  let { recipient }: { recipient: string } = $props();

  let content = $state("");

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const text = content;
    if (!text.trim()) {
      return;
    }

    content = "";
    try {
      await chat.send(text);
    } catch {
      content = text;
    }
  }
</script>

<form class="chat-composer" onsubmit={submit}>
  <label for="message" class="sr-only">Mensagem</label>
  <input
    id="message"
    class="chat-composer__input"
    bind:value={content}
    placeholder="Mensagem para {recipient}"
    maxlength="4000"
    autocomplete="off"
    {@attach (input) => input.focus()}
  />
  <Button type="submit" size="small" disabled={!content.trim()}>
    Enviar
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

<style>
  .chat-composer {
    margin: 0 var(--page-gutter) var(--page-gutter);
    padding: 4px 10px 4px 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 8px;
    background: var(--dark-background-color);
    border: 1px solid var(--border-color);
    transition: border-color ease 0.2s;
  }

  .chat-composer:focus-within {
    border-color: rgba(255, 255, 255, 0.3);
  }

  .chat-composer__input {
    min-width: 0;
    height: 40px;
    flex-grow: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--muted-color);
  }

  .chat-composer__icon {
    width: 14px;
  }
</style>
