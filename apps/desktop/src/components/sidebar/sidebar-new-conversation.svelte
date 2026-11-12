<script lang="ts">
  import TextField from "@/components/text-field/text-field.svelte";
  import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
  import { ServerError } from "@/services/client";
  import { chat } from "@/stores/chat.svelte";

  let { onclose }: { onclose: () => void } = $props();

  let username = $state("");
  let error = $state("");

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const name = username.trim();
    if (!name) {
      return;
    }

    try {
      await chat.start(name);
      onclose();
    } catch (cause) {
      error = describe(cause);
    }
  }

  function describe(cause: unknown): string {
    if (cause instanceof ServerError && cause.code === ErrorCode.NOT_FOUND) {
      return "Usuário não encontrado.";
    }
    if (cause instanceof ServerError && cause.code === ErrorCode.INVALID_REQUEST) {
      return "Você não pode conversar com você mesmo.";
    }
    return "Não foi possível iniciar a conversa.";
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onclose();
    }
  }
</script>

<form class="sidebar-new-conversation" onsubmit={submit}>
  <TextField
    id="new-conversation"
    label="Nome de usuário"
    placeholder="Nome de usuário"
    size="small"
    hideLabel
    focus
    maxlength={32}
    {error}
    bind:value={username}
    oninput={() => (error = "")}
    {onkeydown}
  />
</form>

<style>
  .sidebar-new-conversation {
    margin: 2px 0 4px;
  }
</style>
