<script lang="ts">
  import { t, type Key } from "@/i18n";
  import SettingsAccount from "./settings-account.svelte";
  import SettingsNotifications from "./settings-notifications.svelte";
  import SettingsSystem from "./settings-system.svelte";
  import SettingsVoice from "./settings-voice.svelte";

  type Tab = "account" | "voice" | "system" | "notifications";

  const tabs: { id: Tab; label: Key }[] = [
    { id: "account", label: "settings.account" },
    { id: "voice", label: "settings.voice" },
    { id: "system", label: "settings.system" },
    { id: "notifications", label: "settings.notifications" },
  ];

  let tab = $state<Tab>("account");
</script>

<header class="settings__header">
  <div class="settings__title">
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
      />
    </svg>
    <h1 class="settings__heading">{t("settings.title")}</h1>
  </div>
  <span class="settings__divider" aria-hidden="true"></span>
  <div class="settings__tabs" role="tablist" aria-label={t("settings.sections")}>
    {#each tabs as item (item.id)}
      <button
        class="settings__tab"
        class:settings__tab--active={tab === item.id}
        role="tab"
        aria-selected={tab === item.id}
        onclick={() => (tab = item.id)}
      >
        {t(item.label)}
      </button>
    {/each}
  </div>
</header>

<section class="settings__content" aria-label={t("settings.title")}>
  <div class="settings__panel">
    {#if tab === "account"}
      <SettingsAccount />
    {:else if tab === "voice"}
      <SettingsVoice />
    {:else if tab === "system"}
      <SettingsSystem />
    {:else}
      <SettingsNotifications />
    {/if}
  </div>
</section>

<style>
  .settings__header {
    min-height: 57px;
    padding: 12px var(--page-gutter);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    border-bottom: 1px solid var(--border-color);
  }

  .settings__title {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted-color);
  }

  .settings__title svg {
    width: 20px;
  }

  .settings__heading {
    margin: 0;
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 600;
  }

  .settings__divider {
    width: 1px;
    height: 20px;
    background: var(--border-color);
  }

  .settings__tabs {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }

  .settings__tab {
    height: 32px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--subtle-color);
    font-size: var(--hint-font-size);
    font-weight: 600;
    transition: all ease 0.1s;
  }

  .settings__tab:hover {
    background: var(--surface-color);
    color: var(--muted-color);
  }

  .settings__tab--active,
  .settings__tab--active:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .settings__content {
    position: relative;
    min-height: 0;
    padding: var(--page-gutter);
    flex-grow: 1;
    overflow-y: auto;
  }

  .settings__panel {
    max-width: 560px;
  }
</style>
