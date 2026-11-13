<script lang="ts">
  import { Button } from "@/components";
  import { FriendState } from "@/protocol/ludra/v1/models_pb";
  import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
  import { ServerError } from "@/services/client";
  import { chat } from "@/stores/chat.svelte";

  type Feedback = { text: string; tone: "success" | "error" | "neutral" };

  const conflicts: Record<string, Feedback> = {
    "already friends": { text: "Vocês já são amigos.", tone: "neutral" },
    "friend request already sent": { text: "Você já enviou um pedido para essa pessoa.", tone: "neutral" },
  };

  let username = $state("");
  let feedback = $state<Feedback | null>(null);
  let submitting = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const name = username.trim();
    if (!name || submitting) {
      return;
    }

    submitting = true;
    try {
      const friend = await chat.addFriend(name);
      const peer = friend.user!.username;
      feedback =
        friend.state === FriendState.ACCEPTED
          ? { text: `Agora você e ${peer} são amigos.`, tone: "success" }
          : { text: `Pedido enviado para ${peer}.`, tone: "success" };
    } catch (cause) {
      feedback = describe(cause);
    } finally {
      submitting = false;
    }
  }

  function describe(cause: unknown): Feedback {
    if (!(cause instanceof ServerError)) {
      return { text: "Não foi possível conectar ao servidor.", tone: "error" };
    }
    if (cause.code === ErrorCode.NOT_FOUND) {
      return { text: "Não encontramos ninguém com esse nome de usuário.", tone: "error" };
    }
    if (cause.code === ErrorCode.INVALID_REQUEST) {
      return { text: "Você não pode adicionar você mesmo.", tone: "error" };
    }
    if (cause.code === ErrorCode.TOO_MANY_REQUESTS) {
      return { text: "Muitas tentativas. Aguarde alguns minutos.", tone: "error" };
    }
    return conflicts[cause.message] ?? { text: "Não foi possível enviar o pedido.", tone: "error" };
  }
</script>

<div class="friends-add">
  <h2 class="friends-add__title">Adicionar amigo</h2>
  <p class="friends-add__description">Digite o nome de usuário da pessoa para enviar um pedido de amizade.</p>
  <form class="friends-add__form friends-add__form--{feedback?.tone ?? 'idle'}" onsubmit={submit}>
    <label for="friend-username" class="sr-only">Nome de usuário</label>
    <input
      id="friend-username"
      class="friends-add__input"
      placeholder="Nome de usuário"
      maxlength="32"
      autocomplete="off"
      bind:value={username}
      oninput={() => (feedback = null)}
      {@attach (input) => input.focus()}
    />
    <Button type="submit" size="small" disabled={!username.trim() || submitting}>Enviar pedido</Button>
  </form>
  {#if feedback}
    <span class="friends-add__feedback friends-add__feedback--{feedback.tone}">{feedback.text}</span>
  {/if}
</div>

<style>
  .friends-add {
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .friends-add__title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 600;
    color: var(--muted-color);
  }

  .friends-add__description {
    margin: 0 0 10px;
    color: var(--subtle-color);
  }

  .friends-add__form {
    padding: 4px 4px 4px 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 8px;
    background: var(--dark-background-color);
    border: 1px solid var(--border-color);
    transition: border-color ease 0.2s;
  }

  .friends-add__form--idle:focus-within {
    border-color: rgba(255, 255, 255, 0.3);
  }

  .friends-add__form--success {
    border-color: rgba(28, 151, 73, 0.6);
  }

  .friends-add__form--error {
    border-color: rgba(246, 116, 107, 0.6);
  }

  .friends-add__input {
    min-width: 0;
    height: 40px;
    flex-grow: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--muted-color);
  }

  .friends-add__feedback {
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  .friends-add__feedback--success {
    color: var(--success-color);
  }

  .friends-add__feedback--error {
    color: #f6746b;
  }
</style>
