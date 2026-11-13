<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import EyeButton from "@/components/eye-button/eye-button.svelte";
  import PasswordStrength from "@/components/password-strength/password-strength.svelte";

  type Props = Omit<HTMLInputAttributes, "size"> & {
    id: string;
    label: string;
    value?: string;
    hint?: string;
    error?: string;
    hideLabel?: boolean;
    focus?: boolean;
    strength?: boolean;
    size?: "medium" | "small";
  };

  let {
    id,
    label,
    value = $bindable(""),
    type = "text",
    hint,
    error,
    hideLabel = false,
    focus = false,
    strength = false,
    size = "medium",
    ...rest
  }: Props = $props();

  let revealed = $state(false);

  const secret = $derived(type === "password");
</script>

<div class="text-field">
  <label for={id} class={hideLabel ? "sr-only" : "text-field__label"}>{label}</label>
  <div class="text-field__control">
    <input
      {id}
      class="text-field__input text-field__input--{size}"
      class:text-field__input--error={error}
      class:text-field__input--secret={secret}
      type={secret && revealed ? "text" : type}
      bind:value
      autocomplete="off"
      spellcheck="false"
      {...rest}
      {@attach focus && ((input) => input.focus())}
    />
    {#if secret}
      <span class="text-field__eye">
        <EyeButton shown={revealed} show="password.show" hide="password.hide" ontoggle={() => (revealed = !revealed)} />
      </span>
    {/if}
  </div>
  {#if strength}
    <PasswordStrength password={value} />
  {/if}
  {#if error}
    <span class="text-field__hint text-field__hint--error" role="alert">{error}</span>
  {:else if hint}
    <span class="text-field__hint">{hint}</span>
  {/if}
</div>

<style>
  .text-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .text-field__label {
    font-size: var(--hint-font-size);
    color: var(--body-color);
  }

  .text-field__control {
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .text-field__input {
    padding: 0 12px;
    border-radius: 8px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    color: var(--muted-color);
    outline: 0;
    transition: border-color ease 0.2s;
  }

  .text-field__input:focus {
    border-color: rgba(255, 255, 255, 0.3);
  }

  .text-field__input--medium {
    height: 40px;
  }

  .text-field__input--small {
    height: 32px;
    padding: 0 10px;
    border-radius: 6px;
    font-size: var(--hint-font-size);
  }

  .text-field__input--secret {
    padding-right: 44px;
  }

  .text-field__input--error {
    border-color: var(--error-color);
  }

  .text-field__eye {
    position: absolute;
    top: 50%;
    right: 4px;
    transform: translateY(-50%);
  }

  .text-field__hint {
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .text-field__hint--error {
    color: var(--error-color);
  }
</style>
