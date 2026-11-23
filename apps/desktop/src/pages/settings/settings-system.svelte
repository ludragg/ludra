<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { Button, Checkbox, Select } from "@/components";
  import { autoDownloadLimits, formatSize } from "@/helpers/files";
  import { localeTag, locales, t } from "@/i18n";
  import { syncAutostart, syncTray } from "@/services/desktop";
  import { setDirectCalls } from "@/stores/direct-calls";
  import { preferences } from "@/stores/preferences.svelte";
  import SettingsGroup from "./settings-group.svelte";

  const languages = locales.map(({ id, label }) => ({ value: id, label }));
  const limits = autoDownloadLimits.map((bytes) => ({ value: String(bytes), label: formatSize(bytes) }));

  let folder = $state("");

  $effect(() => {
    void invoke<string>("download_folder")
      .then((path) => (folder = path))
      .catch(() => undefined);
  });

  async function changeFolder() {
    const chosen = await invoke<string | null>("choose_download_folder").catch(() => null);
    if (chosen) {
      folder = chosen;
    }
  }

  async function restoreFolder() {
    folder = await invoke<string>("reset_download_folder").catch(() => folder);
  }
</script>

<div class="settings-system">
  <SettingsGroup title={t("settings.system")}>
    <Checkbox
      label={t("settings.autostart")}
      checked={preferences.values.autostart}
      onchange={(checked) => {
        preferences.set("autostart", checked);
        syncAutostart();
      }}
    />
    <Checkbox
      sub
      label={t("settings.startMinimized")}
      disabled={!preferences.values.autostart}
      checked={preferences.values.autostart && preferences.values.startMinimized}
      onchange={(checked) => preferences.set("startMinimized", checked)}
    />
    <Checkbox
      label={t("settings.minimizeToTray")}
      checked={preferences.values.tray}
      onchange={(checked) => {
        preferences.set("tray", checked);
        syncTray();
      }}
    />
  </SettingsGroup>

  <SettingsGroup title={t("settings.downloads")}>
    <div class="settings-system__downloads">
      <span class="settings-system__label" id="download-folder">{t("settings.downloadFolder")}</span>
      <div class="settings-system__folder">
        <span class="settings-system__path" aria-labelledby="download-folder" data-tooltip={folder}>{folder}</span>
        <Button theme="outline" size="small" onclick={changeFolder}>{t("settings.changeFolder")}</Button>
        <Button theme="outline" size="small" onclick={restoreFolder}>{t("settings.defaultFolder")}</Button>
      </div>
      <span class="settings-system__hint">{t("settings.voiceFolderHint")}</span>
      <Checkbox
        label={t("settings.askDownloadLocation")}
        checked={preferences.values.askDownloadLocation}
        onchange={(checked) => preferences.set("askDownloadLocation", checked)}
      />
      <span class="settings-system__hint settings-system__hint--indented">
        {t("settings.askDownloadLocationHint")}
      </span>
      <Checkbox
        label={t("settings.autoDownload")}
        checked={preferences.values.autoDownload}
        onchange={(checked) => preferences.set("autoDownload", checked)}
      />
      {#if preferences.values.autoDownload}
        <div class="settings-system__limit">
          <Select
            id="auto-download-limit"
            label={t("settings.autoDownloadLimit")}
            options={limits}
            value={String(preferences.values.autoDownloadLimit)}
            onchange={(value) => preferences.set("autoDownloadLimit", Number(value))}
          />
        </div>
      {/if}
    </div>
  </SettingsGroup>

  <SettingsGroup title={t("settings.connection")}>
    <div class="settings-system__connection">
      <Checkbox label={t("settings.directCalls")} checked={preferences.values.directCalls} onchange={setDirectCalls} />
      <span class="settings-system__hint">{t("settings.directCallsHint")}</span>
      <Checkbox
        sub
        label={t("settings.directDownloads")}
        disabled={!preferences.values.directCalls}
        checked={preferences.values.directCalls && preferences.values.directDownloads}
        onchange={(checked) => preferences.set("directDownloads", checked)}
      />
    </div>
  </SettingsGroup>

  <SettingsGroup title={t("settings.language")}>
    <div class="settings-system__language">
      <Select
        id="language"
        label={t("settings.language")}
        hideLabel
        options={languages}
        value={preferences.values.language}
        onchange={(language) => {
          preferences.set("language", language);
          document.documentElement.lang = localeTag();
          syncTray();
        }}
      />
    </div>
  </SettingsGroup>
</div>

<style>
  .settings-system {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .settings-system__connection {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .settings-system__hint {
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .settings-system__downloads {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .settings-system__label {
    font-size: 13px;
    color: var(--muted-color);
  }

  .settings-system__folder {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .settings-system__path {
    min-width: 0;
    height: 40px;
    flex-grow: 1;
    padding: 0 12px;
    display: flex;
    align-items: center;
    overflow: hidden;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--dark-background-color);
    color: var(--muted-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-system__hint--indented {
    margin: -4px 0 4px 32px;
  }

  .settings-system__limit {
    max-width: 288px;
    margin: 4px 0 0 32px;
  }

  .settings-system__language {
    max-width: 320px;
    margin-top: 6px;
  }
</style>
