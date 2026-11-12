<script lang="ts">
  import { Logo, Sidebar } from "@/components";
  import { chat } from "@/stores/chat.svelte";
  import ChatComposer from "./chat-composer.svelte";
  import ChatHeader from "./chat-header.svelte";
  import ChatMessages from "./chat-messages.svelte";
</script>

<div class="chat">
  <Sidebar />

  <main class="chat__main">
    {#if chat.active?.peer}
      <ChatHeader peer={chat.active.peer} />
      {#key chat.activeId}
        <ChatMessages />
        <ChatComposer recipient={chat.active.peer.username} />
      {/key}
    {:else}
      <div class="chat__idle">
        <Logo size="large" />
        <h1 class="chat__idle-title">Suas conversas aparecem aqui</h1>
      </div>
    {/if}
  </main>
</div>

<style>
  .chat {
    height: 100%;
    display: flex;
  }

  .chat__main {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    background: linear-gradient(0deg, var(--dark-background-color) 50%, var(--background-color) 100%);
  }

  .chat__idle {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    text-align: center;
  }

  .chat__idle-title {
    margin: 12px 0 0;
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 600;
    color: var(--muted-color);
  }
</style>
