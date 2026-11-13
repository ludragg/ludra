<script lang="ts">
  import { onMount } from "svelte";
  import { CodeInput } from "@/components";
  import { Cooldown } from "@/helpers/cooldown.svelte";
  import { CodePurpose } from "@/protocol/ludra/v1/client_pb";
  import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
  import { ServerError } from "@/services/client";
  import { chat } from "@/stores/chat.svelte";
  import AuthLayout from "./auth-layout.svelte";
  import type { Navigate } from "./screen";

  let { email, navigate }: { email: string; navigate: Navigate } = $props();

  const cooldown = new Cooldown();

  let code = $state("");
  let error = $state("");
  let submitting = $state(false);

  onMount(() => {
    cooldown.start();
    return () => cooldown.stop();
  });

  async function submit() {
    if (code.length !== 6) {
      error = "Digite os 6 números do código.";
      return;
    }

    submitting = true;
    try {
      await chat.verifyEmail(email, code);
    } catch (cause) {
      error = describe(cause);
    } finally {
      submitting = false;
    }
  }

  async function resend() {
    error = "";
    try {
      await chat.sendCode(email, CodePurpose.VERIFY_EMAIL);
      cooldown.start();
    } catch (cause) {
      error = describe(cause);
    }
  }

  function describe(cause: unknown): string {
    if (cause instanceof ServerError && cause.code === ErrorCode.INVALID_CODE) {
      return "Código inválido ou expirado.";
    }
    if (cause instanceof ServerError && cause.code === ErrorCode.TOO_MANY_REQUESTS) {
      return "Muitas tentativas. Aguarde alguns minutos.";
    }
    if (cause instanceof ServerError) {
      return "Não foi possível confirmar o e-mail.";
    }
    return "Não foi possível conectar ao servidor.";
  }
</script>

<AuthLayout
  title="Confirme seu e-mail"
  submitLabel={submitting ? "Confirmando…" : "Confirmar"}
  {submitting}
  links={[
    {
      prompt: "Não recebeu o código?",
      label: cooldown.remaining > 0 ? `Reenviar em ${cooldown.remaining}s` : "Reenviar",
      disabled: cooldown.remaining > 0,
      onclick: resend,
    },
    { label: "Voltar", onclick: () => navigate({ name: "login" }) },
  ]}
  onsubmit={submit}
>
  {#snippet subtitle()}
    Enviamos um código de 6 números para <span class="verify__email">{email}</span>.
  {/snippet}
  {#snippet fields()}
    <CodeInput id="code" label="Código de verificação" focus {error} bind:value={code} oninput={() => (error = "")} />
  {/snippet}
</AuthLayout>

<style>
  .verify__email {
    color: var(--muted-color);
  }
</style>
