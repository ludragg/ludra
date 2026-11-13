<script lang="ts">
  import { Button, Logo, TextField } from "@/components";
  import { openExternal, repositoryUrl } from "@/helpers/external";
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

  <a class="login__footer" href={repositoryUrl} target="_blank" rel="noreferrer" onclick={openExternal}>
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
    <span class="login__footer-label">GitHub</span>
  </a>
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
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--small-font-size);
    color: var(--subtle-color);
    text-decoration: none;
    transition: color ease 0.2s;
  }

  .login__footer:hover {
    color: var(--muted-color);
  }

  .login__footer svg {
    width: 14px;
  }

  .login__footer-label {
    line-height: 1;
    transform: translateY(1px);
  }
</style>
