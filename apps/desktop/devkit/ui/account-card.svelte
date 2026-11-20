<script lang="ts">
  import { t } from "./i18n.svelte";
  import Icon from "./icon.svelte";
  import { panel, type Account } from "./store.svelte";

  const colors = ["#3e62c0", "#16b195", "#c77dff", "#e8833a", "#d6457a", "#5aa9e6"];

  let { account, onedit }: { account: Account; onedit: () => void } = $props();

  let menuOpen = $state(false);
  let confirming = $state(false);
  let menu = $state<HTMLElement>();

  const color = $derived(colors[[...account.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length]);
  const open = $derived(account.state === "open");

  function toggleMenu() {
    menuOpen = !menuOpen;
    confirming = false;
  }

  function pick(action: () => unknown) {
    menuOpen = false;
    action();
  }

  function remove() {
    if (confirming) {
      pick(() => panel.act("accounts/remove", { id: account.id }));
    } else {
      confirming = true;
    }
  }

  function outside(event: MouseEvent) {
    if (menuOpen && menu && !menu.contains(event.target as Node)) {
      menuOpen = false;
    }
  }
</script>

<svelte:window onclick={outside} onkeydown={(event) => event.key === "Escape" && (menuOpen = false)} />

<div class="account-card">
  <div class="account-card__avatar" style:background={color}>{account.login.charAt(0).toUpperCase()}</div>
  <div class="account-card__text">
    <span class="account-card__login">{account.login}</span>
    <span class="account-card__state">
      <span class="account-card__dot" class:account-card__dot--open={open}></span>
      {account.state === "opening" ? t("opening") : open ? t("stateOpen") : t("stateClosed")}
    </span>
  </div>
  {#if open}
    <button
      type="button"
      class="button button--outline"
      onclick={() => panel.act("profiles/close", { id: account.id })}
    >
      {t("close")}
    </button>
  {:else}
    <button
      type="button"
      class="button button--primary"
      disabled={account.state === "opening"}
      onclick={() => panel.act("profiles/open", { id: account.id })}
    >
      {t("open")}
    </button>
  {/if}
  <div class="account-card__more" bind:this={menu}>
    <button
      type="button"
      class="icon-button"
      aria-label={t("more", { name: account.login })}
      aria-expanded={menuOpen}
      onclick={toggleMenu}
    >
      <Icon name="more" />
    </button>
    {#if menuOpen}
      <div class="account-card__menu" role="menu">
        <button type="button" role="menuitem" class="account-card__option" onclick={() => pick(onedit)}>
          {t("edit")}
        </button>
        <button
          type="button"
          role="menuitem"
          class="account-card__option"
          disabled={account.state !== "closed"}
          onclick={() => pick(() => panel.act("profiles/clear", { id: account.id }))}
        >
          {t("clear")}
        </button>
        <button
          type="button"
          role="menuitem"
          class="account-card__option account-card__option--danger"
          onclick={remove}
        >
          {confirming ? t("confirmRemove") : t("remove")}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .account-card {
    padding: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-radius: 8px;
    background: var(--surface-color);
  }

  .account-card__avatar {
    width: 36px;
    height: 36px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #ffffff;
    font-weight: 600;
  }

  .account-card__text {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    line-height: 1.35;
  }

  .account-card__login {
    overflow: hidden;
    font-weight: 600;
    color: var(--muted-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-card__state {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .account-card__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--subtle-color);
  }

  .account-card__dot--open {
    background: var(--success-color);
  }

  .account-card__more {
    position: relative;
  }

  .account-card__menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 10;
    min-width: 180px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--dark-background-color);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .account-card__option {
    padding: 8px 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted-color);
    text-align: left;
  }

  .account-card__option:not(:disabled):hover {
    background: var(--active-color);
  }

  .account-card__option:disabled {
    opacity: var(--disabled-opacity);
  }

  .account-card__option--danger {
    color: var(--error-color);
  }
</style>
