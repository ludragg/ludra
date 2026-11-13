<script lang="ts">
  import { Checkbox } from "@/components";
  import { t } from "@/i18n";
  import { preferences } from "@/stores/preferences.svelte";
</script>

<div class="settings-notifications">
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
  <Checkbox
    label={t("settings.sound")}
    checked={preferences.values.sound}
    onchange={(checked) => preferences.set("sound", checked)}
  />
</div>

<style>
  .settings-notifications {
    display: flex;
    flex-direction: column;
  }
</style>
