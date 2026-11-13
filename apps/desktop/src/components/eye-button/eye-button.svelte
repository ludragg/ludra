<script lang="ts">
  import { t, type Key } from "@/i18n";

  let { shown, show, hide, ontoggle }: { shown: boolean; show: Key; hide: Key; ontoggle: () => void } = $props();
</script>

<button
  type="button"
  class="eye-button"
  aria-label={shown ? t(hide) : t(show)}
  title={shown ? t(hide) : t(show)}
  aria-pressed={shown}
  onclick={ontoggle}
>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {#if shown}
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    {:else}
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    {/if}
  </svg>
</button>

<style>
  .eye-button {
    width: 32px;
    height: 32px;
    flex: none;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--subtle-color);
    transition: all ease 0.1s;
  }

  .eye-button:hover {
    background: var(--hover-color);
    color: var(--muted-color);
  }

  .eye-button svg {
    width: 18px;
  }
</style>
