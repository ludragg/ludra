<script lang="ts">
  import { onMount } from "svelte";
  import { CodeInput } from "@/components";
  import { Cooldown } from "@/helpers/cooldown.svelte";
  import { t } from "@/i18n";
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
      await chat.verifyTwoFactor(code);
    } catch (cause) {
      error = describe(cause);
    } finally {
      submitting = false;
    }
  }

  async function resend() {
    error = "";
    try {
      await chat.resendTwoFactor();
      cooldown.start();
    } catch (cause) {
      error = describe(cause);
    }
  }

  function back() {
    chat.cancelTwoFactor();
    navigate({ name: "login" });
  }

  function describe(cause: unknown): string {
    if (cause instanceof ServerError && cause.code === ErrorCode.INVALID_CODE) {
      return t("common.invalidCode");
    }
    if (cause instanceof ServerError && cause.code === ErrorCode.TOO_MANY_REQUESTS) {
      return t("common.tooManyRequests");
    }
    if (cause instanceof ServerError) {
      return t("login.failed");
    }
    return t("common.connectionLost");
  }
</script>

<AuthLayout
  title={t("twoFactor.title")}
  submitLabel={submitting ? t("common.signingIn") : t("common.signIn")}
  {submitting}
  links={[
    {
      prompt: t("common.noCode"),
      label: cooldown.remaining > 0 ? t("common.resendIn", { seconds: cooldown.remaining }) : t("common.resend"),
      disabled: cooldown.remaining > 0,
      onclick: resend,
    },
    { label: t("common.back"), onclick: back },
  ]}
  onsubmit={submit}
>
  {#snippet subtitle()}
    {t("common.codeSentBefore")}<span class="two-factor__email">{email}</span>{t("common.codeSentAfter")}
  {/snippet}
  {#snippet fields()}
    <CodeInput id="code" label={t("common.codeLabel")} focus {error} bind:value={code} oninput={() => (error = "")} />
  {/snippet}
</AuthLayout>

<style>
  .two-factor__email {
    color: var(--muted-color);
  }
</style>
