<script lang="ts">
  import { onMount } from "svelte";
  import { CodeInput } from "@/components";
  import { Cooldown } from "@/helpers/cooldown.svelte";
  import { t } from "@/i18n";
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
      error = t("common.codeRequired");
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
      return t("common.invalidCode");
    }
    if (cause instanceof ServerError && cause.code === ErrorCode.TOO_MANY_REQUESTS) {
      return t("common.tooManyRequests");
    }
    if (cause instanceof ServerError) {
      return t("verify.failed");
    }
    return t("common.connectionFailed");
  }
</script>

<AuthLayout
  title={t("verify.title")}
  submitLabel={submitting ? t("verify.submitting") : t("verify.submit")}
  {submitting}
  links={[
    {
      prompt: t("common.noCode"),
      label: cooldown.remaining > 0 ? t("common.resendIn", { seconds: cooldown.remaining }) : t("common.resend"),
      disabled: cooldown.remaining > 0,
      onclick: resend,
    },
    { label: t("common.back"), onclick: () => navigate({ name: "login" }) },
  ]}
  onsubmit={submit}
>
  {#snippet subtitle()}
    {t("common.codeSentBefore")}<span class="verify__email">{email}</span>{t("common.codeSentAfter")}
  {/snippet}
  {#snippet fields()}
    <CodeInput id="code" label={t("common.codeLabel")} focus {error} bind:value={code} oninput={() => (error = "")} />
  {/snippet}
</AuthLayout>

<style>
  .verify__email {
    color: var(--muted-color);
  }
</style>
