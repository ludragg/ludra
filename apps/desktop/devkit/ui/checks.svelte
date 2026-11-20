<script lang="ts">
  import { t } from "./i18n.svelte";
  import Icon from "./icon.svelte";
  import { panel, type Check } from "./store.svelte";

  let { checks, checking }: { checks: Check[]; checking: boolean } = $props();
</script>

<section class="checks">
  <div class="checks__header">
    <h2 class="section-title">{t("checks")}</h2>
    <button type="button" class="button button--outline" disabled={checking} onclick={() => panel.act("checks/fix")}>
      {t("fix")}
    </button>
    <button type="button" class="button button--outline" disabled={checking} onclick={() => panel.act("checks/run")}>
      {t("run")}
    </button>
  </div>
  <ul class="checks__list">
    {#each checks as check (check.id)}
      <li class="checks__item checks__item--{check.state}">
        {#if check.state === "passed"}
          <Icon name="check" size={14} />
        {:else if check.state === "failed"}
          <Icon name="cross" size={14} />
        {:else if check.state === "running"}
          <span class="checks__spinner"></span>
        {:else}
          <Icon name="dash" size={14} />
        {/if}
        {check.label}
      </li>
    {/each}
  </ul>
</section>

<style>
  .checks {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .checks__header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .checks__list {
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 12px;
    list-style: none;
  }

  .checks__item {
    padding: 4px 0;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--body-color);
  }

  .checks__item--idle,
  .checks__item--pending {
    color: var(--subtle-color);
  }

  .checks__item--passed :global(svg) {
    color: var(--success-color);
  }

  .checks__item--failed :global(svg) {
    color: var(--error-color);
  }

  .checks__spinner {
    width: 12px;
    height: 12px;
    margin: 1px;
    flex: none;
    border: 2px solid var(--warning-color);
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
