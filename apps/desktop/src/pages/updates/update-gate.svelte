<script lang="ts">
  import { Button, Logo } from "@/components";
  import { t } from "@/i18n";
  import { updates } from "@/stores/updates.svelte";

  const busy = $derived(updates.phase === "downloading" || updates.phase === "installing");
</script>

<div class="update-gate" role="alertdialog" aria-modal="true" aria-labelledby="update-title">
  <div class="update-gate__card">
    <Logo />
    <h2 id="update-title" class="update-gate__title">{t("updates.title")}</h2>
    <p class="update-gate__text">{t("updates.required", { version: updates.version })}</p>

    {#if busy}
      <div
        class="update-gate__progress"
        role="progressbar"
        aria-valuenow={updates.progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div class="update-gate__bar" style:width="{updates.phase === 'installing' ? 100 : updates.progress}%"></div>
      </div>
      <span class="update-gate__status">
        {updates.phase === "installing"
          ? t("updates.installing")
          : t("updates.downloading", { progress: updates.progress })}
      </span>
    {:else}
      {#if updates.phase === "failed"}
        <span class="update-gate__error" role="alert">{t("updates.failed")}</span>
      {/if}
      <Button onclick={() => updates.install()} {@attach (button) => button.focus()}>
        {updates.phase === "failed" ? t("updates.retry") : t("updates.install")}
      </Button>
    {/if}
  </div>
</div>

<style>
  .update-gate {
    position: fixed;
    inset: 32px 0 0;
    z-index: 50;
    display: grid;
    place-items: center;
    background: linear-gradient(0deg, var(--dark-background-color) 50%, var(--background-color) 100%);
  }

  .update-gate__card {
    width: min(380px, calc(100vw - 48px));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    text-align: center;
  }

  .update-gate__title {
    margin: 8px 0 0;
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 600;
    color: var(--muted-color);
  }

  .update-gate__text {
    margin: 0;
    color: var(--body-color);
  }

  .update-gate__progress {
    width: 100%;
    height: 6px;
    overflow: hidden;
    border-radius: 3px;
    background: var(--surface-color);
  }

  .update-gate__bar {
    height: 100%;
    background: var(--brand-color);
    transition: width ease 0.2s;
  }

  .update-gate__status {
    font-size: var(--small-font-size);
    color: var(--subtle-color);
    font-variant-numeric: tabular-nums;
  }

  .update-gate__error {
    font-size: var(--small-font-size);
    color: #f6746b;
  }
</style>
