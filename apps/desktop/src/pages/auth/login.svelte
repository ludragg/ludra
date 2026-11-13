<script lang="ts">
  import { TextField } from "@/components";
  import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
  import { ServerError } from "@/services/client";
  import { chat } from "@/stores/chat.svelte";
  import AuthLayout from "./auth-layout.svelte";
  import type { Navigate } from "./screen";

  type Field = "login" | "password";

  let { navigate }: { navigate: Navigate } = $props();

  let login = $state("");
  let password = $state("");
  let errors = $state<Partial<Record<Field, string>>>({});
  let submitting = $state(false);

  function validate(): Partial<Record<Field, string>> {
    const result: Partial<Record<Field, string>> = {};
    if (!login.trim()) {
      result.login = "Digite seu usuário ou e-mail.";
    }
    if (!password) {
      result.password = "Digite sua senha.";
    }
    return result;
  }

  async function submit() {
    errors = validate();
    if (Object.keys(errors).length > 0) {
      return;
    }

    submitting = true;
    try {
      const pendingEmail = await chat.login(login.trim(), password);
      if (pendingEmail) {
        navigate({ name: "verify", email: pendingEmail });
      }
    } catch (cause) {
      errors = { password: describe(cause) };
    } finally {
      submitting = false;
    }
  }

  function describe(cause: unknown): string {
    if (cause instanceof ServerError && cause.code === ErrorCode.INVALID_CREDENTIALS) {
      return "Usuário, e-mail ou senha incorretos.";
    }
    if (cause instanceof ServerError && cause.code === ErrorCode.TOO_MANY_REQUESTS) {
      return "Muitas tentativas. Aguarde alguns minutos.";
    }
    if (cause instanceof ServerError) {
      return "Não foi possível entrar.";
    }
    return "Não foi possível conectar ao servidor.";
  }

  function clear(field: Field) {
    delete errors[field];
    chat.notice = "";
  }
</script>

<AuthLayout
  title="Entrar no Ludra"
  subtitle="Que bom te ver de novo."
  submitLabel={submitting ? "Entrando…" : "Entrar"}
  {submitting}
  links={[{ prompt: "Não tem uma conta?", label: "Criar conta", onclick: () => navigate({ name: "register" }) }]}
  onsubmit={submit}
>
  {#snippet fields()}
    <TextField
      id="login"
      label="Usuário ou e-mail"
      placeholder="Usuário ou e-mail"
      hideLabel
      focus
      maxlength={254}
      error={errors.login}
      bind:value={login}
      oninput={() => clear("login")}
    />
    <TextField
      id="password"
      type="password"
      label="Senha"
      placeholder="Senha"
      hideLabel
      maxlength={128}
      error={errors.password || chat.notice}
      bind:value={password}
      oninput={() => clear("password")}
    />
    <button type="button" class="login__forgot" onclick={() => navigate({ name: "forgot" })}>Esqueceu a senha?</button>
  {/snippet}
</AuthLayout>

<style>
  .login__forgot {
    align-self: flex-end;
    margin-top: -4px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--subtle-color);
    font-size: var(--small-font-size);
    transition: color ease 0.2s;
  }

  .login__forgot:hover {
    color: var(--muted-color);
  }
</style>
