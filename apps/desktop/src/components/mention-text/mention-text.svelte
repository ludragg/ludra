<script lang="ts">
  import { markup } from "@/helpers/text";

  let { text, names }: { text: string; names: Set<string> } = $props();
</script>

{#each markup(text, names) as span}{#if span.mention}<span class="mention-text">{span.text}</span
    >{:else}{span.text}{/if}{/each}

<style>
  .mention-text {
    padding: 0 4px;
    margin: 0 1px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--brand-color) 22%, transparent);
    color: color-mix(in srgb, var(--brand-color) 45%, #ffffff);
  }
</style>
