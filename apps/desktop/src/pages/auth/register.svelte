<script lang="ts">
  import { TextField } from "@/components";
  import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
  import { ServerError } from "@/services/client";
  import { chat } from "@/stores/chat.svelte";
  import AuthLayout from "./auth-layout.svelte";
  import type { Navigate } from "./screen";

  type Field = "email" | "username" | "password";

  let { navigate }: { navigate: Navigate } = $props();

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const usernamePattern = /^[a-zA-Z0-9_.]{3,32}$/;

  const messages: Record<string, { field: Field; text: string }> = {
    "invalid email": { field: "email", text: "Digite um e-mail válido." },
    "email already in use": { field: "email", text: "Este e-mail já está em uso." },
    "username already in use": { field: "username", text: "Este nome de usuário já está em uso." },
  };

  let email = $state("");
  let username = $state("");
  let password = $state("");
  let errors = $state<Partial<Record<Field, string>>>({});
  let submitting = $state(false);

  function validate(): Partial<Record<Field, string>> {
    const result: Partial<Record<Field, string>> = {};
    if (!emailPattern.test(email.trim())) {
      result.email = "Digite um e-mail válido.";
    }
    if (!usernamePattern.test(username.trim())) {
      result.username = "Use 3 a 32 caracteres: letras, números, _ ou .";
    }
    if ([...password].length < 8) {
      result.password = "A senha precisa ter pelo menos 8 caracteres.";
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
      const pendingEmail = await chat.register(email.trim(), username.trim(), password);
      if (pendingEmail) {
        navigate({ name: "verify", email: pendingEmail });
      }
    } catch (cause) {
      errors = describe(cause);
    } finally {
      submitting = false;
    }
  }

  function describe(cause: unknown): Partial<Record<Field, string>> {
    if (cause instanceof ServerError) {
      const known = messages[cause.message];
      if (known) {
        return { [known.field]: known.text };
      }
      if (cause.code === ErrorCode.TOO_MANY_REQUESTS) {
        return { password: "Muitas tentativas. Aguarde alguns minutos." };
      }
      if (cause.code === ErrorCode.INVALID_REQUEST) {
        return { password: "Confira os dados e tente de novo." };
      }
      return { password: "Não foi possível criar a conta." };
    }
    return { password: "Não foi possível conectar ao servidor." };
  }

  function clear(field: Field) {
    delete errors[field];
    chat.notice = "";
  }
</script>

<AuthLayout
  title="Criar conta"
  subtitle="Escolha como serás reconhecido."
  submitLabel={submitting ? "Criando…" : "Criar conta"}
  {submitting}
  links={[{ prompt: "Já tem uma conta?", label: "Entrar", onclick: () => navigate({ name: "login" }) }]}
  onsubmit={submit}
>
  {#snippet fields()}
    <TextField
      id="email"
      type="email"
      label="E-mail"
      placeholder="E-mail"
      hideLabel
      focus
      maxlength={254}
      error={errors.email}
      bind:value={email}
      oninput={() => clear("email")}
    />
    <TextField
      id="username"
      label="Usuário"
      placeholder="Usuário"
      hideLabel
      maxlength={32}
      error={errors.username}
      bind:value={username}
      oninput={() => clear("username")}
    />
    <TextField
      id="password"
      type="password"
      label="Senha"
      placeholder="Senha"
      hideLabel
      maxlength={128}
      hint="Mínimo de 8 caracteres."
      error={errors.password}
      bind:value={password}
      oninput={() => clear("password")}
    />
  {/snippet}
</AuthLayout>
