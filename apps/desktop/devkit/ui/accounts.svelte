<script lang="ts">
  import AccountCard from "./account-card.svelte";
  import AccountForm from "./account-form.svelte";
  import { t } from "./i18n.svelte";
  import Icon from "./icon.svelte";
  import { panel, type Account, type ProfileState } from "./store.svelte";

  let { accounts, guest }: { accounts: Account[]; guest: ProfileState } = $props();

  let form = $state<{ account?: Account } | null>(null);

  function toggleGuest() {
    void panel.act(guest === "open" ? "profiles/close" : "profiles/open", { id: "guest" });
  }
</script>

<section class="accounts">
  <div class="accounts__header">
    <h2 class="section-title">{t("accounts")}</h2>
    <button type="button" class="button button--outline" disabled={guest === "opening"} onclick={toggleGuest}>
      {guest === "opening" ? t("opening") : guest === "open" ? t("closeGuest") : t("openGuest")}
    </button>
    <button type="button" class="button button--primary" onclick={() => (form = form ? null : {})}>
      <Icon name="plus" size={14} />
      {t("addAccount")}
    </button>
  </div>

  {#if form}
    {#key form}
      <AccountForm account={form.account} onclose={() => (form = null)} />
    {/key}
  {/if}

  {#if accounts.length > 0}
    <div class="accounts__grid">
      {#each accounts as account (account.id)}
        <AccountCard {account} onedit={() => (form = { account })} />
      {/each}
    </div>
  {:else if !form}
    <p class="accounts__empty">{t("noAccounts")}</p>
  {/if}
</section>

<style>
  .accounts {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .accounts__header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .accounts__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 8px;
  }

  .accounts__empty {
    margin: 0;
    padding: 16px;
    border: 1px dashed var(--border-color);
    border-radius: 8px;
    color: var(--subtle-color);
  }
</style>
