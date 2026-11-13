<script lang="ts">
  import { Checkbox } from "@/components";
  import { t } from "@/i18n";
  import { syncAutostart, syncTray } from "@/services/desktop";
  import { preferences } from "@/stores/preferences.svelte";
</script>

<div class="settings-system">
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
</div>

<style>
  .settings-system {
    display: flex;
    flex-direction: column;
  }
</style>
