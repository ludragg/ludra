<script lang="ts">
  import { TextField } from "@/components";
  import { validPassword } from "@/helpers/password";
  import { t, type Key } from "@/i18n";
  import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
  import { ServerError } from "@/services/client";
  import { chat } from "@/stores/chat.svelte";
  import AuthLayout from "./auth-layout.svelte";
  import type { Navigate } from "./screen";

  type Field = "email" | "username" | "password";

  let { navigate }: { navigate: Navigate } = $props();

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const usernamePattern = /^[a-zA-Z0-9_.]{3,32}$/;

  const messages: Record<string, { field: Field; text: Key }> = {
    "invalid email": { field: "email", text: "common.invalidEmail" },
    "email already in use": { field: "email", text: "register.emailTaken" },
    "username already in use": { field: "username", text: "register.usernameTaken" },
  };

  let email = $state("");
  let username = $state("");
  let password = $state("");
  let errors = $state<Partial<Record<Field, string>>>({});
  let submitting = $state(false);

  function validate(): Partial<Record<Field, string>> {
    const result: Partial<Record<Field, string>> = {};
    if (!emailPattern.test(email.trim())) {
      result.email = t("common.invalidEmail");
    }
    if (!usernamePattern.test(username.trim())) {
      result.username = t("register.usernameRule");
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
      const next = await chat.register(email.trim(), username.trim(), password);
      if (next && "verify" in next) {
        navigate({ name: "verify", email: next.verify });
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
        return { [known.field]: t(known.text) };
      }
      if (cause.code === ErrorCode.TOO_MANY_REQUESTS) {
        return { password: t("common.tooManyRequests") };
      }
      if (cause.code === ErrorCode.INVALID_REQUEST) {
        return { password: t("register.checkData") };
      }
      return { password: t("register.failed") };
    }
    return { password: t("common.connectionFailed") };
  }

  function clear(field: Field) {
    delete errors[field];
    chat.notice = "";
  }
</script>

<AuthLayout
  title={t("register.title")}
  subtitle={t("register.subtitle")}
  submitLabel={submitting ? t("register.submitting") : t("register.submit")}
  {submitting}
  links={[{ prompt: t("register.hasAccount"), label: t("common.signIn"), onclick: () => navigate({ name: "login" }) }]}
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
      error={errors.email}
      bind:value={email}
      oninput={() => clear("email")}
    />
    <TextField
      id="username"
      label={t("common.username")}
      placeholder={t("common.username")}
      hideLabel
      maxlength={32}
      error={errors.username}
      bind:value={username}
      oninput={() => clear("username")}
    />
    <TextField
      id="password"
      type="password"
      label={t("common.password")}
      placeholder={t("common.password")}
      hideLabel
      maxlength={128}
      hint={t("common.passwordHint")}
      strength
      error={errors.password}
      bind:value={password}
      oninput={() => clear("password")}
    />
  {/snippet}
</AuthLayout>
