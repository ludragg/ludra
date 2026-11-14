<script lang="ts">
  import type { Snippet } from "svelte";

  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<section class="settings-group">
  <h2 class="settings-group__title">{title}</h2>
  {@render children()}
</section>

<style>
  .settings-group {
    display: flex;
    flex-direction: column;
  }

  .settings-group__title {
    margin: 0 0 4px;
    font-size: var(--small-font-size);
    font-weight: 600;
    color: var(--subtle-color);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
</style>
