<script lang="ts" generics="T extends string">
  type Option = { value: T; label: string };

  let {
    id,
    label,
    options,
    value,
    hideLabel = false,
    onchange,
  }: {
    id: string;
    label: string;
    options: Option[];
    value: T;
    hideLabel?: boolean;
    onchange: (value: T) => void;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();

  const current = $derived(options.find((option) => option.value === value));

  function choose(next: T) {
    open = false;
    if (next !== value) {
      onchange(next);
    }
  }

  function onpointerdown(event: PointerEvent) {
    if (open && !root?.contains(event.target as Node)) {
      open = false;
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (open && event.key === "Escape") {
      open = false;
    }
  }
</script>

<svelte:window {onpointerdown} {onkeydown} />

<div class="select" bind:this={root}>
  <span id="{id}-label" class={hideLabel ? "sr-only" : "select__label"}>{label}</span>
  <div class="select__control">
    <button
      class="select__button"
      class:select__button--open={open}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-labelledby="{id}-label"
      onclick={() => (open = !open)}
    >
      {current?.label}
      <svg
        class="select__chevron"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    {#if open}
      <div class="select__list" role="listbox" aria-labelledby="{id}-label">
        {#each options as option (option.value)}
          <button
            class="select__option"
            role="option"
            aria-selected={option.value === value}
            onclick={() => choose(option.value)}
          >
            {option.label}
            {#if option.value === value}
              <svg
                class="select__check"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12l5 5L20 7" />
              </svg>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .select {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .select__label {
    font-size: var(--hint-font-size);
    color: var(--body-color);
  }

  .select__control {
    position: relative;
  }

  .select__button {
    width: 100%;
    height: 40px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-radius: 8px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    color: var(--muted-color);
    text-align: left;
    transition: border-color ease 0.2s;
  }

  .select__button:hover {
    border-color: rgba(255, 255, 255, 0.15);
  }

  .select__button--open,
  .select__button--open:hover {
    border-color: rgba(255, 255, 255, 0.3);
  }

  .select__chevron {
    width: 14px;
    flex: none;
    color: var(--subtle-color);
    transition: transform ease 0.15s;
  }

  .select__button--open .select__chevron {
    transform: rotate(180deg);
  }

  .select__list {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-radius: 8px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 1;
  }

  .select__option {
    width: 100%;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted-color);
    text-align: left;
    transition: background ease 0.1s;
  }

  .select__option:hover {
    background: var(--surface-color);
  }

  .select__check {
    width: 16px;
    color: var(--brand-color);
  }
</style>
