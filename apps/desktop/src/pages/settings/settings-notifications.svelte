<script lang="ts">
  import { Checkbox } from "@/components";
  import { t } from "@/i18n";
  import { preferences } from "@/stores/preferences.svelte";
  import SettingsGroup from "./settings-group.svelte";
</script>

<div class="settings-notifications">
  <SettingsGroup title={t("settings.notificationsGroup")}>
    <Checkbox
      label={t("settings.notifyMessages")}
      checked={preferences.values.notifyMessages}
      onchange={(checked) => preferences.set("notifyMessages", checked)}
    />
    <Checkbox
      label={t("settings.notifyRequests")}
      checked={preferences.values.notifyRequests}
      onchange={(checked) => preferences.set("notifyRequests", checked)}
    />
  </SettingsGroup>

  <SettingsGroup title={t("settings.soundsGroup")}>
    <Checkbox
      label={t("settings.sound")}
      checked={preferences.values.sound}
      onchange={(checked) => preferences.set("sound", checked)}
    />
    <Checkbox
      label={t("settings.callSounds")}
      checked={preferences.values.callSounds}
      onchange={(checked) => preferences.set("callSounds", checked)}
    />
  </SettingsGroup>
</div>

<style>
  .settings-notifications {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
</style>
