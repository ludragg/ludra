<script lang="ts">
  import { t } from "./i18n.svelte";
  import Icon from "./icon.svelte";
  import { panel, type Code } from "./store.svelte";

  let { codes }: { codes: Code[] } = $props();

  let copied = $state("");

  async function copy(code: Code) {
    await navigator.clipboard.writeText(code.code).catch(() => undefined);
    copied = code.id;
    setTimeout(() => copied === code.id && (copied = ""), 1500);
  }
</script>

<section class="codes">
  <div class="codes__header">
    <h2 class="section-title">{t("codes")}</h2>
    <button type="button" class="icon-button" aria-label={t("clearCodes")} onclick={() => panel.act("codes/clear")}>
      <Icon name="trash" />
    </button>
  </div>
  <div class="codes__list">
    {#each codes as code (code.id)}
      <button
        type="button"
        class="button button--outline codes__code"
        aria-label={t("copy", { code: code.code })}
        onclick={() => copy(code)}
      >
        <span class="codes__label">{code.user} · {t(code.purpose)}</span>
        <span class="codes__value">{code.code}</span>
        <Icon name={copied === code.id ? "check" : "copy"} size={14} />
      </button>
    {/each}
  </div>
</section>

<style>
  .codes {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .codes__header {
    display: flex;
    align-items: center;
    margin: -6px 0;
  }

  .codes__list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .codes__code {
    height: 36px;
    gap: 8px;
    font-weight: 400;
  }

  .codes__label {
    color: var(--subtle-color);
  }

  .codes__value {
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--brand-color);
  }
</style>
