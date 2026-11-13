<script lang="ts">
  import { TextField } from "@/components";
  import { t } from "@/i18n";
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
      error = t("common.invalidEmail");
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
      return t("common.tooManyRequests");
    }
    if (cause instanceof ServerError) {
      return t("forgot.failed");
    }
    return t("common.connectionFailed");
  }
</script>

<AuthLayout
  title={t("forgot.title")}
  subtitle={t("forgot.subtitle")}
  submitLabel={submitting ? t("forgot.submitting") : t("forgot.submit")}
  {submitting}
  links={[{ prompt: t("forgot.remembered"), label: t("common.signIn"), onclick: () => navigate({ name: "login" }) }]}
  onsubmit={submit}
>
  {#snippet fields()}
    <TextField
      id="email"
      type="email"
      label={t("common.email")}
      placeholder={t("common.email")}
      hideLabel
      focus
      maxlength={254}
      {error}
      bind:value={email}
      oninput={() => (error = "")}
    />
  {/snippet}
</AuthLayout>
