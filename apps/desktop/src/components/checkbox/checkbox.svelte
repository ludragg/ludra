<script lang="ts">
  let {
    label,
    checked,
    disabled = false,
    onchange,
  }: { label: string; checked: boolean; disabled?: boolean; onchange: (checked: boolean) => void } = $props();
</script>

<button class="checkbox" role="checkbox" aria-checked={checked} {disabled} onclick={() => onchange(!checked)}>
  <span class="checkbox__box" class:checkbox__box--checked={checked}>
    {#if checked}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12l5 5L20 7" />
      </svg>
    {/if}
  </span>
  {label}
</button>

<style>
  .checkbox {
    width: 100%;
    padding: 10px 0;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 0;
    background: transparent;
    color: var(--body-color);
    text-align: left;
    transition: color ease 0.1s;
  }

  .checkbox:hover:not(:disabled) {
    color: var(--muted-color);
  }

  .checkbox:disabled {
    opacity: var(--disabled-opacity);
  }

  .checkbox__box {
    width: 20px;
    height: 20px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 4px;
    background: var(--background-color);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .checkbox__box--checked {
    background: var(--brand-color);
    border-color: var(--brand-color);
    color: var(--dark-background-color);
  }

  .checkbox__box svg {
    width: 14px;
  }
</style>
