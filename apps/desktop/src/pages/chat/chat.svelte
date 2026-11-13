<script lang="ts">
  import { Sidebar } from "@/components";
  import Friends from "@/pages/friends/friends.svelte";
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
        {#if chat.isFriend(chat.active.peer.id)}
          <ChatComposer recipient={chat.active.peer.username} />
        {:else}
          <p class="chat__locked">Vocês não são amigos. Adicione {chat.active.peer.username} para conversar.</p>
        {/if}
      {/key}
    {:else}
      <Friends />
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

  .chat__locked {
    margin: 0 var(--page-gutter) var(--page-gutter);
    padding: 14px;
    border-radius: 8px;
    background: var(--surface-color);
    border: 1px solid var(--border-color);
    color: var(--subtle-color);
    text-align: center;
  }
</style>
