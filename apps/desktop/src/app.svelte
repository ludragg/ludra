<script lang="ts">
  import { TitleBar } from "@/components";
  import Chat from "@/pages/chat/chat.svelte";
  import Login from "@/pages/login/login.svelte";
  import { chat } from "@/stores/chat.svelte";
</script>

<div class="app">
  <TitleBar />
  <div class="app__content">
    {#if chat.user}
      <Chat />
    {:else}
      <Login />
    {/if}
  </div>
</div>

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .app__content {
    min-height: 0;
    flex-grow: 1;
  }
</style>
