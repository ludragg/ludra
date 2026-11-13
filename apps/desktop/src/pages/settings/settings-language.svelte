<script lang="ts">
  import { Select } from "@/components";
  import { localeTag, locales, t } from "@/i18n";
  import { syncTray } from "@/services/desktop";
  import { preferences } from "@/stores/preferences.svelte";

  const options = locales.map(({ id, label }) => ({ value: id, label }));
</script>

<div class="settings-language">
  <Select
    id="language"
    label={t("settings.language")}
    {options}
    value={preferences.values.language}
    onchange={(language) => {
      preferences.set("language", language);
      document.documentElement.lang = localeTag();
      syncTray();
    }}
  />
</div>

<style>
  .settings-language {
    max-width: 320px;
  }
</style>
