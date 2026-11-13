<script lang="ts">
  import { Avatar, Button, Checkbox, TextField } from "@/components";
  import EyeButton from "@/components/eye-button/eye-button.svelte";
  import { maskEmail } from "@/helpers/email";
  import { maxUploadBytes, toAvatar } from "@/helpers/image";
  import { validPassword } from "@/helpers/password";
  import { t } from "@/i18n";
  import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
  import { ServerError } from "@/services/client";
  import { chat } from "@/stores/chat.svelte";

  type PasswordField = "current" | "next";

  let picker = $state<HTMLInputElement>();
  let emailShown = $state(false);
  let photoError = $state("");
  let uploading = $state(false);

  let currentPassword = $state("");
  let nextPassword = $state("");
  let passwordErrors = $state<Partial<Record<PasswordField, string>>>({});
  let passwordSaved = $state(false);
  let savingPassword = $state(false);

  let confirmingDisable = $state(false);
  let disablePassword = $state("");
  let twoFactorError = $state("");
  let changingTwoFactor = $state(false);

  async function pick(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }

    photoError = "";
    if (file.type !== "image/png") {
      photoError = t("settings.photoType");
      return;
    }
    if (file.size > maxUploadBytes) {
      photoError = t("settings.photoSize");
      return;
    }

    uploading = true;
    try {
      await chat.setAvatar(await toAvatar(file));
    } catch (cause) {
      photoError =
        cause instanceof ServerError && cause.code === ErrorCode.TOO_MANY_REQUESTS
          ? t("common.tooManyRequests")
          : t("settings.photoFailed");
    } finally {
      uploading = false;
    }
  }

  async function removePhoto() {
    photoError = "";
    uploading = true;
    try {
      await chat.removeAvatar();
    } catch {
      photoError = t("settings.photoFailed");
    } finally {
      uploading = false;
    }
  }

  async function savePassword(event: SubmitEvent) {
    event.preventDefault();
    passwordSaved = false;
    passwordErrors = {};

    if (!currentPassword) {
      passwordErrors = { current: t("login.passwordRequired") };
      return;
    }
    if (!validPassword(nextPassword)) {
      passwordErrors = { next: t("common.passwordRule") };
      return;
    }

    savingPassword = true;
    try {
      await chat.changePassword(currentPassword, nextPassword);
      currentPassword = "";
      nextPassword = "";
      passwordSaved = true;
    } catch (cause) {
      passwordErrors = describePassword(cause);
    } finally {
      savingPassword = false;
    }
  }

  function describePassword(cause: unknown): Partial<Record<PasswordField, string>> {
    if (!(cause instanceof ServerError)) {
      return { next: t("common.connectionFailed") };
    }
    switch (cause.code) {
      case ErrorCode.INVALID_CREDENTIALS:
        return { current: t("settings.wrongPassword") };
      case ErrorCode.INVALID_REQUEST:
        return { next: t("common.passwordLength") };
      case ErrorCode.TOO_MANY_REQUESTS:
        return { next: t("common.tooManyRequests") };
      default:
        return { next: t("settings.passwordFailed") };
    }
  }

  async function toggleTwoFactor(enabled: boolean) {
    twoFactorError = "";
    if (!enabled) {
      confirmingDisable = true;
      return;
    }

    changingTwoFactor = true;
    try {
      await chat.setTwoFactor(true);
    } catch {
      twoFactorError = t("settings.twoFactorFailed");
    } finally {
      changingTwoFactor = false;
    }
  }

  async function disableTwoFactor(event: SubmitEvent) {
    event.preventDefault();
    if (!disablePassword) {
      twoFactorError = t("login.passwordRequired");
      return;
    }

    changingTwoFactor = true;
    try {
      await chat.setTwoFactor(false, disablePassword);
      cancelDisable();
    } catch (cause) {
      if (cause instanceof ServerError && cause.code === ErrorCode.INVALID_CREDENTIALS) {
        twoFactorError = t("settings.wrongPassword");
      } else if (cause instanceof ServerError && cause.code === ErrorCode.TOO_MANY_REQUESTS) {
        twoFactorError = t("common.tooManyRequests");
      } else {
        twoFactorError = t("settings.twoFactorFailed");
      }
    } finally {
      changingTwoFactor = false;
    }
  }

  function cancelDisable() {
    confirmingDisable = false;
    disablePassword = "";
    twoFactorError = "";
  }
</script>

{#if chat.user}
  <div class="settings-account">
    <section class="settings-account__section">
      <h2 class="settings-account__title">{t("settings.profile")}</h2>
      <div class="settings-account__profile">
        <Avatar user={chat.user} size="huge" />
        <div class="settings-account__identity">
          <div class="settings-account__names">
            <span class="settings-account__username">{chat.user.username}</span>
            <span class="settings-account__email">
              <span class="settings-account__email-text">{emailShown ? chat.email : maskEmail(chat.email)}</span>
              <EyeButton
                shown={emailShown}
                show="settings.showEmail"
                hide="settings.hideEmail"
                ontoggle={() => (emailShown = !emailShown)}
              />
            </span>
          </div>
          <div class="settings-account__actions">
            <Button size="small" disabled={uploading} onclick={() => picker?.click()}>
              {chat.user.avatar ? t("settings.changePhoto") : t("settings.uploadPhoto")}
            </Button>
            {#if chat.user.avatar}
              <Button size="small" theme="outline" disabled={uploading} onclick={removePhoto}>
                {t("settings.removePhoto")}
              </Button>
            {/if}
          </div>
        </div>
      </div>
      <input bind:this={picker} class="sr-only" type="file" accept="image/png" tabindex="-1" onchange={pick} />
      {#if photoError}
        <span class="settings-account__message settings-account__message--error" role="alert">{photoError}</span>
      {:else}
        <span class="settings-account__message">{t("settings.photoHint")}</span>
      {/if}
    </section>

    <form class="settings-account__section" onsubmit={savePassword} novalidate>
      <h2 class="settings-account__title">{t("settings.changePassword")}</h2>
      <TextField
        id="current-password"
        type="password"
        label={t("settings.currentPassword")}
        placeholder={t("settings.currentPassword")}
        hideLabel
        maxlength={128}
        error={passwordErrors.current}
        bind:value={currentPassword}
        oninput={() => {
          delete passwordErrors.current;
          passwordSaved = false;
        }}
      />
      <TextField
        id="new-password"
        type="password"
        label={t("settings.newPassword")}
        placeholder={t("settings.newPassword")}
        hideLabel
        maxlength={128}
        hint={t("common.passwordHint")}
        strength
        error={passwordErrors.next}
        bind:value={nextPassword}
        oninput={() => {
          delete passwordErrors.next;
          passwordSaved = false;
        }}
      />
      <div class="settings-account__row">
        <Button type="submit" size="small" disabled={savingPassword}>
          {savingPassword ? t("settings.saving") : t("settings.savePassword")}
        </Button>
        {#if passwordSaved}
          <span class="settings-account__message settings-account__message--success">
            {t("settings.passwordSaved")}
          </span>
        {/if}
      </div>
    </form>

    <section class="settings-account__section settings-account__section--tight">
      <h2 class="settings-account__title">{t("settings.security")}</h2>
      <Checkbox
        label={t("settings.twoFactor")}
        checked={chat.twoFactor}
        disabled={changingTwoFactor || confirmingDisable}
        onchange={toggleTwoFactor}
      />
      {#if confirmingDisable}
        <form class="settings-account__confirm" onsubmit={disableTwoFactor} novalidate>
          <TextField
            id="disable-two-factor"
            type="password"
            label={t("settings.disableTwoFactor")}
            maxlength={128}
            focus
            error={twoFactorError}
            bind:value={disablePassword}
            oninput={() => (twoFactorError = "")}
          />
          <div class="settings-account__row">
            <Button type="submit" size="small" disabled={changingTwoFactor}>{t("settings.disable")}</Button>
            <Button size="small" theme="outline" onclick={cancelDisable}>{t("settings.cancel")}</Button>
          </div>
        </form>
      {:else if twoFactorError}
        <span class="settings-account__message settings-account__message--error" role="alert">{twoFactorError}</span>
      {/if}
    </section>
  </div>
{/if}

<style>
  .settings-account {
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  .settings-account__section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .settings-account__section--tight {
    gap: 8px;
  }

  .settings-account__title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 600;
    color: var(--muted-color);
  }

  .settings-account__profile {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .settings-account__identity {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .settings-account__names {
    display: flex;
    flex-direction: column;
    line-height: 1.35;
  }

  .settings-account__username {
    font-weight: 600;
    color: var(--muted-color);
  }

  .settings-account__email {
    min-width: 0;
    margin: -6px 0;
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  .settings-account__email-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-account__actions,
  .settings-account__row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .settings-account__row {
    gap: 12px;
  }

  .settings-account__confirm {
    padding-left: 32px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .settings-account__message {
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .settings-account__message--success {
    font-size: var(--hint-font-size);
    color: var(--success-color);
  }

  .settings-account__message--error {
    color: var(--error-color);
  }
</style>
