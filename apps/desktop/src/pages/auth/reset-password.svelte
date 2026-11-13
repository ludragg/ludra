<script lang="ts">
  import { onMount } from "svelte";
  import { CodeInput, TextField } from "@/components";
  import { Cooldown } from "@/helpers/cooldown.svelte";
  import { validPassword } from "@/helpers/password";
  import { t } from "@/i18n";
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
      result.code = t("common.codeRequired");
    }
    if (!validPassword(password)) {
      result.password = t("common.passwordRule");
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
      return { code: t("common.invalidCode") };
    }
    if (cause instanceof ServerError && cause.code === ErrorCode.TOO_MANY_REQUESTS) {
      return { code: t("common.tooManyRequests") };
    }
    if (cause instanceof ServerError && cause.code === ErrorCode.INVALID_REQUEST) {
      return { password: t("common.passwordLength") };
    }
    if (cause instanceof ServerError) {
      return { password: t("reset.failed") };
    }
    return { password: t("common.connectionFailed") };
  }
</script>

<AuthLayout
  title={t("reset.title")}
  submitLabel={submitting ? t("reset.submitting") : t("reset.submit")}
  {submitting}
  links={[
    {
      prompt: t("common.noCode"),
      label: cooldown.remaining > 0 ? t("common.resendIn", { seconds: cooldown.remaining }) : t("common.resend"),
      disabled: cooldown.remaining > 0,
      onclick: resend,
    },
    { label: t("common.back"), onclick: () => navigate({ name: "forgot" }) },
  ]}
  onsubmit={submit}
>
  {#snippet subtitle()}
    {t("reset.subtitleBefore")}<span class="reset__email">{email}</span>{t("reset.subtitleAfter")}
  {/snippet}
  {#snippet fields()}
    <CodeInput
      id="code"
      label={t("common.codeLabel")}
      focus
      error={errors.code}
      bind:value={code}
      oninput={() => delete errors.code}
    />
    <TextField
      id="password"
      type="password"
      label={t("reset.newPassword")}
      placeholder={t("reset.newPassword")}
      hideLabel
      maxlength={128}
      hint={t("common.passwordHint")}
      strength
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
