<script lang="ts">
  import { Avatar, Button, Checkbox, TextField } from "@/components";
  import EyeButton from "@/components/eye-button/eye-button.svelte";
  import { maskEmail } from "@/helpers/email";
  import { applyMask } from "@/helpers/mask";
  import { avatarTypes, maxUploadBytes, toAvatar } from "@/helpers/image";
  import { validPassword } from "@/helpers/password";
  import { localeTag, t } from "@/i18n";
  import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
  import { ServerError } from "@/services/client";
  import { chat } from "@/stores/chat.svelte";
  import SettingsGroup from "./settings-group.svelte";

  type PasswordField = "current" | "next";

  const usernamePattern = /^[a-zA-Z0-9_.]{3,32}$/;
  const renameInterval = 30 * 24 * 60 * 60 * 1000;

  let picker = $state<HTMLInputElement>();
  let emailShown = $state(false);
  let photoError = $state("");
  let uploading = $state(false);

  let currentPassword = $state("");
  let nextPassword = $state("");
  let passwordErrors = $state<Partial<Record<PasswordField, string>>>({});
  let passwordSaved = $state(false);
  let savingPassword = $state(false);

  let renaming = $state(false);
  let newUsername = $state("");
  let usernameError = $state("");
  let savingUsername = $state(false);

  const renameAt = $derived(chat.renamedAt ? chat.renamedAt + renameInterval : 0);
  const renameLocked = $derived(renameAt > Date.now());
  const renameDate = $derived(new Date(renameAt).toLocaleDateString(localeTag()));

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
    if (!avatarTypes.includes(file.type)) {
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

  function startRename() {
    newUsername = chat.user?.username ?? "";
    usernameError = "";
    renaming = true;
  }

  function typeUsername(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const masked = applyMask(input.value, "username");
    input.value = masked;
    newUsername = masked;
    usernameError = "";
  }

  async function saveUsername(event: SubmitEvent) {
    event.preventDefault();
    const username = newUsername.trim();
    if (!usernamePattern.test(username)) {
      usernameError = t("register.usernameRule");
      return;
    }
    if (username === chat.user?.username) {
      renaming = false;
      return;
    }

    savingUsername = true;
    try {
      await chat.setUsername(username);
      renaming = false;
    } catch (cause) {
      usernameError = describeUsername(cause);
    } finally {
      savingUsername = false;
    }
  }

  function describeUsername(cause: unknown): string {
    if (!(cause instanceof ServerError)) {
      return t("common.connectionFailed");
    }
    switch (cause.code) {
      case ErrorCode.ALREADY_EXISTS:
        return t("register.usernameTaken");
      case ErrorCode.INVALID_REQUEST:
        return t("register.usernameRule");
      case ErrorCode.FORBIDDEN:
        return t("settings.usernameLocked", { date: renameDate });
      case ErrorCode.TOO_MANY_REQUESTS:
        return t("common.tooManyRequests");
      default:
        return t("settings.usernameFailed");
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
    if (nextPassword === currentPassword) {
      passwordErrors = { next: t("settings.samePassword") };
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
        return {
          next:
            cause.message === "new password must be different"
              ? t("settings.samePassword")
              : t("common.passwordLength"),
        };
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
    <SettingsGroup title={t("settings.profile")}>
      <div class="settings-account__section">
        <div class="settings-account__profile">
          <Avatar user={chat.user} size="huge" />
          <div class="settings-account__identity">
            <div class="settings-account__names">
              {#if renaming}
                <form class="settings-account__rename-form" onsubmit={saveUsername} novalidate>
                  <div class="settings-account__rename-row">
                    <label for="new-username" class="sr-only">{t("settings.newUsername")}</label>
                    <input
                      id="new-username"
                      class="settings-account__rename-input"
                      class:settings-account__rename-input--error={!!usernameError}
                      maxlength="32"
                      autocomplete="off"
                      spellcheck="false"
                      aria-invalid={!!usernameError}
                      aria-describedby="new-username-hint"
                      value={newUsername}
                      oninput={typeUsername}
                      onkeydown={(event) => event.key === "Escape" && (renaming = false)}
                      {@attach (input) => input.select()}
                    />
                    <button
                      type="submit"
                      class="settings-account__icon settings-account__icon--save"
                      aria-label={t("settings.saveUsername")}
                      data-tooltip={t("settings.saveUsername")}
                      disabled={savingUsername}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.4"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="settings-account__icon"
                      aria-label={t("settings.cancel")}
                      data-tooltip={t("settings.cancel")}
                      onclick={() => (renaming = false)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.4"
                        stroke-linecap="round"
                        aria-hidden="true"
                      >
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                    <span
                      id="new-username-hint"
                      class="settings-account__message settings-account__rename-hint"
                      class:settings-account__message--error={!!usernameError}
                      role={usernameError ? "alert" : undefined}
                    >
                      {usernameError || t("settings.usernameHint")}
                    </span>
                  </div>
                </form>
              {:else}
                <span class="settings-account__username">
                  {chat.user.username}
                  <span
                    class="settings-account__rename"
                    data-tooltip={renameLocked
                      ? t("settings.usernameLocked", { date: renameDate })
                      : t("settings.changeUsername")}
                  >
                    <button
                      type="button"
                      class="settings-account__icon"
                      aria-label={t("settings.changeUsername")}
                      disabled={renameLocked}
                      onclick={startRename}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M4 20h4L19 9l-4-4L4 16z" />
                        <path d="m13.5 6.5 4 4" />
                      </svg>
                    </button>
                  </span>
                </span>
              {/if}
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
        <input
          bind:this={picker}
          class="sr-only"
          type="file"
          accept={avatarTypes.join(",")}
          tabindex="-1"
          onchange={pick}
        />
        {#if photoError}
          <span class="settings-account__message settings-account__message--error" role="alert">{photoError}</span>
        {:else}
          <span class="settings-account__message">{t("settings.photoHint")}</span>
        {/if}
      </div>
    </SettingsGroup>

    <SettingsGroup title={t("settings.security")}>
      <div class="settings-account__security">
        <form class="settings-account__section" onsubmit={savePassword} novalidate>
          <h3 class="settings-account__title">{t("settings.changePassword")}</h3>
          <TextField
            id="current-password"
            mask="none"
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

        <div class="settings-account__section settings-account__section--tight">
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
                mask="none"
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
            <span class="settings-account__message settings-account__message--error" role="alert">{twoFactorError}</span
            >
          {/if}
        </div>
      </div>
    </SettingsGroup>
  </div>
{/if}

<style>
  .settings-account {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .settings-account__security {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .settings-account__section {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .settings-account__security .settings-account__section {
    margin-top: 0;
  }

  .settings-account__section--tight {
    gap: 8px;
  }

  .settings-account__title {
    margin: 0;
    font-size: var(--hint-font-size);
    font-weight: 400;
    color: var(--body-color);
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
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    color: var(--muted-color);
  }

  .settings-account__rename {
    display: flex;
  }

  .settings-account__icon {
    width: 26px;
    height: 26px;
    padding: 5px;
    flex: none;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--subtle-color);
    transition: all ease 0.1s;
  }

  .settings-account__icon:hover:not(:disabled) {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .settings-account__icon:disabled {
    opacity: var(--disabled-opacity);
    cursor: default;
    pointer-events: none;
  }

  .settings-account__icon--save:hover:not(:disabled) {
    color: var(--success-color);
  }

  .settings-account__rename-form {
    display: flex;
  }

  .settings-account__rename-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .settings-account__rename-hint {
    min-width: 0;
    margin-left: 4px;
    line-height: 15px;
  }

  .settings-account__rename-input {
    width: 200px;
    flex: none;
    height: 30px;
    padding: 0 8px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    outline: 0;
    background: var(--dark-background-color);
    color: var(--muted-color);
    font-weight: 600;
  }

  .settings-account__rename-input--error {
    border-color: var(--error-color);
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
