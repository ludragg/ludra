<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  type Props = HTMLButtonAttributes & {
    theme?: "primary" | "outline" | "dark" | "danger";
    size?: "medium" | "small";
    children: Snippet;
  };

  let { theme = "primary", size = "medium", type = "button", children, ...rest }: Props = $props();
</script>

<button {type} class="button button--{theme}" class:button--small={size === "small"} {...rest}>
  {@render children()}
</button>

<style>
  .button {
    min-height: 40px;
    padding: 8px 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    font-weight: 600;
    transition: all ease 0.2s;
  }

  .button:active:not(:disabled) {
    opacity: var(--active-opacity);
  }

  .button:disabled {
    opacity: var(--disabled-opacity);
  }

  .button--small {
    min-height: 36px;
    padding: 0 12px;
    gap: 4px;
    border-radius: 6px;
    font-size: var(--hint-font-size);
  }

  .button--primary {
    background: var(--muted-color);
    color: var(--dark-background-color);
  }

  .button--primary:hover:not(:disabled) {
    background: #dadbe1;
  }

  .button--outline {
    background: transparent;
    border-color: var(--border-color);
    color: var(--muted-color);
  }

  .button--outline:hover:not(:disabled) {
    background: var(--active-color);
  }

  .button--dark {
    background: var(--dark-background-color);
    color: var(--muted-color);
  }

  .button--danger {
    background: var(--danger-color);
    color: var(--muted-color);
  }

  .button--danger:hover:not(:disabled) {
    background: #b3203f;
  }
</style>
