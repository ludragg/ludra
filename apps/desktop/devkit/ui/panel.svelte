<script lang="ts">
  import { isTauri } from "@tauri-apps/api/core";
  import Tooltip from "@/components/tooltip/tooltip.svelte";
  import Accounts from "./accounts.svelte";
  import Checks from "./checks.svelte";
  import Codes from "./codes.svelte";
  import { currentLocale, setLocale, t, type Locale } from "./i18n.svelte";
  import Icon from "./icon.svelte";
  import Logs from "./logs.svelte";
  import { panel } from "./store.svelte";
  import Services from "./services.svelte";
  import TitleBar from "./title-bar.svelte";

  const locales: Locale[] = ["pt", "en"];

  $effect(() => {
    document.title = panel.state ? `Ludra Dev v${panel.state.version}` : "Ludra Dev";
  });
</script>

<div class="panel">
  {#if isTauri()}
    <TitleBar version={panel.state?.version ?? ""} />
  {/if}
  {#if !panel.connected || panel.notice}
    <div class="panel__notice" role="alert">
      <span>{panel.connected ? panel.notice : t("disconnected")}</span>
      {#if panel.connected}
        <button type="button" class="icon-button" aria-label={t("dismiss")} onclick={() => (panel.notice = "")}>
          <Icon name="cross" size={14} />
        </button>
      {/if}
    </div>
  {/if}

  {#if panel.state}
    <div class="panel__body">
      <aside class="panel__aside">
        <div class="panel__toolbar">
          <div class="panel__languages" role="group" aria-label={t("language")}>
            {#each locales as locale (locale)}
              <button
                type="button"
                class="panel__language"
                class:panel__language--selected={currentLocale() === locale}
                aria-pressed={currentLocale() === locale}
                onclick={() => setLocale(locale)}
              >
                {locale.toUpperCase()}
              </button>
            {/each}
          </div>
          <span class="panel__spacer"></span>
          <button type="button" class="button button--outline" onclick={() => panel.act("all/stop")}>
            <Icon name="stop" size={14} />
            {t("stopAll")}
          </button>
          <button type="button" class="button button--primary" onclick={() => panel.act("all/start")}>
            <Icon name="play" size={14} />
            {t("startAll")}
          </button>
        </div>
        <Services snapshot={panel.state} />
        <Checks checks={panel.state.checks} checking={panel.state.checking} />
      </aside>
      <main class="panel__main">
        <Accounts accounts={panel.state.accounts} guest={panel.state.guest} />
        {#if panel.state.codes.length > 0}
          <Codes codes={panel.state.codes} />
        {/if}
        <Logs />
      </main>
    </div>
  {/if}
</div>

<Tooltip />

<style>
  .panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--background-color);
  }

  .panel__toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .panel__languages {
    padding: 2px;
    display: flex;
    gap: 2px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }

  .panel__language {
    height: 26px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--subtle-color);
    font-size: var(--small-font-size);
    font-weight: 600;
  }

  .panel__language:hover {
    color: var(--muted-color);
  }

  .panel__language--selected {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .panel__spacer {
    flex-grow: 1;
  }

  .panel__notice {
    padding: 6px 8px 6px var(--page-gutter);
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    background: color-mix(in srgb, var(--error-color) 16%, var(--dark-background-color));
    border-bottom: 1px solid var(--border-color);
    color: var(--muted-color);
  }

  .panel__notice span {
    flex-grow: 1;
  }

  .panel__body {
    min-height: 0;
    flex-grow: 1;
    display: flex;
    flex-wrap: wrap;
    overflow-y: auto;
  }

  .panel__aside {
    padding: 20px;
    flex: 1 1 340px;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 24px;
    background: var(--dark-background-color);
    border-right: 1px solid var(--border-color);
  }

  .panel__main {
    min-width: 0;
    min-height: 100%;
    padding: 20px var(--page-gutter);
    flex: 999 1 560px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
</style>
