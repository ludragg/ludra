<script lang="ts">
  import { Button } from "@/components";
  import type { Release } from "@/changelog";
  import { t } from "@/i18n";
  import { preferences } from "@/stores/preferences.svelte";
  import { updates } from "@/stores/updates.svelte";

  let { release }: { release: Release } = $props();

  const notes = $derived(release.notes[preferences.values.language] ?? release.notes.pt);

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      updates.dismissNotes();
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="whats-new">
  <div class="whats-new__card" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
    <span class="whats-new__version">{t("updates.version", { version: release.version })}</span>
    <h2 id="whats-new-title" class="whats-new__title">{t("updates.whatsNew")}</h2>

    {#if notes.features.length > 0}
      <section class="whats-new__section">
        <h3 class="whats-new__heading">{t("updates.features")}</h3>
        <ul class="whats-new__list">
          {#each notes.features as item (item)}
            <li>{item}</li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if notes.fixes.length > 0}
      <section class="whats-new__section">
        <h3 class="whats-new__heading">{t("updates.fixes")}</h3>
        <ul class="whats-new__list">
          {#each notes.fixes as item (item)}
            <li>{item}</li>
          {/each}
        </ul>
      </section>
    {/if}

    <div class="whats-new__actions">
      <Button onclick={() => updates.dismissNotes()} {@attach (button) => button.focus()}>{t("updates.close")}</Button>
    </div>
  </div>
</div>

<style>
  .whats-new {
    position: fixed;
    inset: 32px 0 0;
    z-index: 40;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.6);
  }

  .whats-new__card {
    width: min(460px, calc(100vw - 48px));
    max-height: calc(100vh - 96px);
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    border-radius: 12px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
  }

  .whats-new__version {
    align-self: flex-start;
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--brand-color);
    color: var(--dark-background-color);
    font-size: var(--small-font-size);
    font-weight: 700;
  }

  .whats-new__title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 600;
    color: var(--muted-color);
  }

  .whats-new__section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .whats-new__heading {
    margin: 0;
    font-size: var(--small-font-size);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--subtle-color);
  }

  .whats-new__list {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--body-color);
  }

  .whats-new__actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
