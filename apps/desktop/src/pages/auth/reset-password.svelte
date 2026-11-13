<script lang="ts">
  import { onMount } from "svelte";
  import { CodeInput, TextField } from "@/components";
  import { Cooldown } from "@/helpers/cooldown.svelte";
  import { CodePurpose } from "@/protocol/ludra/v1/client_pb";
  import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
  import { ServerError } from "@/services/client";
  import { chat } from "@/stores/chat.svelte";
  import AuthLayout from "./auth-layout.svelte";
  import type { Navigate } from "./screen";

  type Field = "code" | "password";

  let { email, navigate }: { email: string; navigate: Navigate } = $props();

  const cooldown = new Cooldown();

  let code = $state("");
  let password = $state("");
  let errors = $state<Partial<Record<Field, string>>>({});
  let submitting = $state(false);

  onMount(() => {
    cooldown.start();
    return () => cooldown.stop();
  });

  function validate(): Partial<Record<Field, string>> {
    const result: Partial<Record<Field, string>> = {};
    if (code.length !== 6) {
      result.code = "Digite os 6 números do código.";
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
      await chat.resetPassword(email, code, password);
    } catch (cause) {
      errors = describe(cause);
    } finally {
      submitting = false;
    }
  }

  async function resend() {
    errors = {};
    try {
      await chat.sendCode(email, CodePurpose.RESET_PASSWORD);
      cooldown.start();
    } catch (cause) {
      errors = describe(cause);
    }
  }

  function describe(cause: unknown): Partial<Record<Field, string>> {
    if (cause instanceof ServerError && cause.code === ErrorCode.INVALID_CODE) {
      return { code: "Código inválido ou expirado." };
    }
    if (cause instanceof ServerError && cause.code === ErrorCode.TOO_MANY_REQUESTS) {
      return { code: "Muitas tentativas. Aguarde alguns minutos." };
    }
    if (cause instanceof ServerError && cause.code === ErrorCode.INVALID_REQUEST) {
      return { password: "A senha precisa ter de 8 a 128 caracteres." };
    }
    if (cause instanceof ServerError) {
      return { password: "Não foi possível redefinir a senha." };
    }
    return { password: "Não foi possível conectar ao servidor." };
  }
</script>

<AuthLayout
  title="Nova senha"
  submitLabel={submitting ? "Redefinindo…" : "Redefinir senha"}
  {submitting}
  links={[
    {
      prompt: "Não recebeu o código?",
      label: cooldown.remaining > 0 ? `Reenviar em ${cooldown.remaining}s` : "Reenviar",
      disabled: cooldown.remaining > 0,
      onclick: resend,
    },
    { label: "Voltar", onclick: () => navigate({ name: "forgot" }) },
  ]}
  onsubmit={submit}
>
  {#snippet subtitle()}
    Digite o código enviado para <span class="reset__email">{email}</span> e escolha a nova senha.
  {/snippet}
  {#snippet fields()}
    <CodeInput
      id="code"
      label="Código de verificação"
      focus
      error={errors.code}
      bind:value={code}
      oninput={() => delete errors.code}
    />
    <TextField
      id="password"
      type="password"
      label="Nova senha"
      placeholder="Nova senha"
      hideLabel
      maxlength={128}
      hint="Mínimo de 8 caracteres."
      error={errors.password}
      bind:value={password}
      oninput={() => delete errors.password}
    />
  {/snippet}
</AuthLayout>

<style>
  .reset__email {
    color: var(--muted-color);
  }
</style>
