<script lang="ts">
  import { TextField } from "@/components";
  import { CodePurpose } from "@/protocol/ludra/v1/client_pb";
  import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
  import { ServerError } from "@/services/client";
  import { chat } from "@/stores/chat.svelte";
  import AuthLayout from "./auth-layout.svelte";
  import type { Navigate } from "./screen";

  let { navigate }: { navigate: Navigate } = $props();

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let email = $state("");
  let error = $state("");
  let submitting = $state(false);

  async function submit() {
    const address = email.trim();
    if (!emailPattern.test(address)) {
      error = "Digite um e-mail válido.";
      return;
    }

    submitting = true;
    try {
      await chat.sendCode(address, CodePurpose.RESET_PASSWORD);
      navigate({ name: "reset", email: address });
    } catch (cause) {
      error = describe(cause);
    } finally {
      submitting = false;
    }
  }

  function describe(cause: unknown): string {
    if (cause instanceof ServerError && cause.code === ErrorCode.TOO_MANY_REQUESTS) {
      return "Muitas tentativas. Aguarde alguns minutos.";
    }
    if (cause instanceof ServerError) {
      return "Não foi possível enviar o código.";
    }
    return "Não foi possível conectar ao servidor.";
  }
</script>

<AuthLayout
  title="Redefinir senha"
  subtitle="Digite seu e-mail e enviaremos um código."
  submitLabel={submitting ? "Enviando…" : "Enviar código"}
  {submitting}
  links={[{ prompt: "Lembrou a senha?", label: "Entrar", onclick: () => navigate({ name: "login" }) }]}
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
      {error}
      bind:value={email}
      oninput={() => (error = "")}
    />
  {/snippet}
</AuthLayout>
