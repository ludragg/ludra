<script lang="ts">
  type Props = {
    id: string;
    label: string;
    value?: string;
    error?: string;
    length?: number;
    focus?: boolean;
    oninput?: () => void;
  };

  let { id, label, value = $bindable(""), error, length = 6, focus = false, oninput }: Props = $props();

  let focused = $state(false);

  const slots = $derived(Array.from({ length }, (_, index) => value[index] ?? ""));
  const current = $derived(Math.min(value.length, length - 1));

  function input(event: Event & { currentTarget: HTMLInputElement }) {
    value = event.currentTarget.value.replace(/\D/g, "").slice(0, length);
    event.currentTarget.value = value;
    oninput?.();
  }
</script>

<div class="code-input">
  <div class="code-input__boxes">
    <label for={id} class="sr-only">{label}</label>
    <input
      {id}
      class="code-input__field"
      {value}
      inputmode="numeric"
      maxlength={length}
      autocomplete="off"
      spellcheck="false"
      oninput={input}
      onfocus={() => (focused = true)}
      onblur={() => (focused = false)}
      {@attach focus && ((field) => field.focus())}
    />
    {#each slots as digit, index (index)}
      <span
        class="code-input__box"
        class:code-input__box--active={focused && index === current}
        class:code-input__box--error={error}
        aria-hidden="true"
      >
        {digit}
      </span>
    {/each}
  </div>
  {#if error}
    <span class="code-input__error" role="alert">{error}</span>
  {/if}
</div>

<style>
  .code-input {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .code-input__boxes {
    position: relative;
    display: flex;
    gap: 8px;
  }

  .code-input__field {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: transparent;
    caret-color: transparent;
    opacity: 0;
    cursor: text;
  }

  .code-input__box {
    width: 44px;
    height: 52px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 600;
    color: var(--muted-color);
    pointer-events: none;
    transition: border-color ease 0.2s;
  }

  .code-input__box--active {
    border-color: rgba(255, 255, 255, 0.3);
  }

  .code-input__box--error {
    border-color: var(--error-color);
  }

  .code-input__error {
    align-self: stretch;
    font-size: var(--small-font-size);
    color: var(--error-color);
  }
</style>
