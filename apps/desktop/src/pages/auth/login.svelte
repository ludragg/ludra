<script lang="ts">
  import { TextField } from "@/components";
  import { t } from "@/i18n";
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
      result.login = t("login.loginRequired");
    }
    if (!password) {
      result.password = t("login.passwordRequired");
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
      const next = await chat.login(login.trim(), password);
      if (next && "verify" in next) {
        navigate({ name: "verify", email: next.verify });
      } else if (next && "twoFactor" in next) {
        navigate({ name: "twoFactor", email: next.twoFactor });
      }
    } catch (cause) {
      errors = { password: describe(cause) };
    } finally {
      submitting = false;
    }
  }

  function describe(cause: unknown): string {
    if (cause instanceof ServerError && cause.code === ErrorCode.INVALID_CREDENTIALS) {
      return t("login.invalidCredentials");
    }
    if (cause instanceof ServerError && cause.code === ErrorCode.TOO_MANY_REQUESTS) {
      return t("common.tooManyRequests");
    }
    if (cause instanceof ServerError) {
      return t("login.failed");
    }
    return t("common.connectionFailed");
  }

  function clear(field: Field) {
    delete errors[field];
    chat.notice = "";
  }
</script>

<AuthLayout
  title={t("login.title")}
  subtitle={t("login.subtitle")}
  submitLabel={submitting ? t("common.signingIn") : t("common.signIn")}
  {submitting}
  links={[
    { prompt: t("login.noAccount"), label: t("login.createAccount"), onclick: () => navigate({ name: "register" }) },
  ]}
  onsubmit={submit}
>
  {#snippet fields()}
    <TextField
      id="login"
      label={t("login.login")}
      placeholder={t("login.login")}
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
      label={t("common.password")}
      placeholder={t("common.password")}
      hideLabel
      maxlength={128}
      error={errors.password || chat.notice}
      bind:value={password}
      oninput={() => clear("password")}
    />
    <button type="button" class="login__forgot" onclick={() => navigate({ name: "forgot" })}>{t("login.forgot")}</button
    >
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
