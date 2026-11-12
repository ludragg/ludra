<script lang="ts">
  import Chat from "@/pages/chat/chat.svelte";
  import Login from "@/pages/login/login.svelte";
  import { chat } from "@/stores/chat.svelte";
</script>

{#if chat.user}
  <Chat />
{:else}
  <Login />
{/if}
