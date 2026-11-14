<script lang="ts">
  import { Checkbox, Select } from "@/components";
  import { localeTag, locales, t } from "@/i18n";
  import { syncAutostart, syncTray } from "@/services/desktop";
  import { preferences } from "@/stores/preferences.svelte";
  import SettingsGroup from "./settings-group.svelte";

  const languages = locales.map(({ id, label }) => ({ value: id, label }));
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
      label={t("settings.startMinimized")}
      checked={preferences.values.startMinimized}
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

  .settings-system__language {
    max-width: 320px;
    margin-top: 6px;
  }
</style>
