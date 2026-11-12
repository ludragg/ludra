<script lang="ts">
  import { Button, Logo, TextField } from "@/components";
  import { chat } from "@/stores/chat.svelte";

  const pattern = /^[a-zA-Z0-9_.]{3,32}$/;

  let username = $state("");
  let invalid = $state(false);

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const name = username.trim();
    invalid = !pattern.test(name);
    if (!invalid) {
      chat.login(name);
    }
  }

  function oninput() {
    invalid = false;
    chat.error = "";
  }
</script>

<main class="login">
  <form class="login__card" onsubmit={submit}>
    <header class="login__header">
      <Logo size="large" />
      <h1 class="login__title">Entrar no Ludra</h1>
      <p class="login__subtitle">Escolha como serás reconhecido.</p>
    </header>

    <TextField
      id="username"
      label="Usuário"
      placeholder="Usuário"
      hideLabel
      maxlength={32}
      focus
      error={invalid ? "Use 3 a 32 caracteres: letras, números, _ ou ." : chat.error}
      bind:value={username}
      {oninput}
    />

    <Button type="submit" disabled={chat.connecting}>
      {chat.connecting ? "Entrando…" : "Entrar"}
    </Button>
  </form>

  <span class="login__footer">AGPL-3.0</span>
</main>

<style>
  .login {
    min-height: 100%;
    padding: 32px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    background: linear-gradient(0deg, var(--dark-background-color) 50%, var(--background-color) 100%);
  }

  .login__card {
    width: 100%;
    max-width: 360px;
    padding: 32px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    border-radius: 8px;
    background: var(--dark-background-color);
    border: 1px solid var(--border-color);
  }

  .login__header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    text-align: center;
  }

  .login__title {
    margin: 12px 0 0;
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--muted-color);
  }

  .login__subtitle {
    margin: 0;
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  .login__footer {
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }
</style>
