<script lang="ts">
  import { untrack } from "svelte";
  import TextField from "@/components/text-field/text-field.svelte";
  import { t } from "./i18n.svelte";
  import { panel, type Account } from "./store.svelte";

  let { account, onclose }: { account?: Account; onclose: () => void } = $props();

  let login = $state(untrack(() => account?.login ?? ""));
  let password = $state("");
  let saving = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    const saved = account
      ? await panel.act("accounts/update", { id: account.id, login, password })
      : await panel.act("accounts/add", { login, password });
    saving = false;
    if (saved) {
      onclose();
    }
  }
</script>

<form class="account-form" onsubmit={submit}>
  <div class="account-form__field">
    <TextField id="account-login" label={t("login")} size="small" maxlength={254} focus bind:value={login} />
  </div>
  <div class="account-form__field">
    <TextField
      id="account-password"
      type="password"
      mask="none"
      label={t("password")}
      placeholder={account ? t("passwordKeep") : ""}
      size="small"
      maxlength={128}
      bind:value={password}
    />
  </div>
  <div class="account-form__actions">
    <button type="button" class="button button--outline" onclick={onclose}>{t("cancel")}</button>
    <button type="submit" class="button button--primary" disabled={saving}>{t("save")}</button>
  </div>
</form>

<style>
  .account-form {
    padding: 16px;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--dark-background-color);
  }

  .account-form__field {
    min-width: 0;
    flex: 1 1 200px;
  }

  .account-form__actions {
    display: flex;
    gap: 8px;
  }
</style>
