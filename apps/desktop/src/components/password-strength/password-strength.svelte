<script lang="ts">
  import { passwordStrength } from "@/helpers/password";
  import { t, type Key } from "@/i18n";

  let { password }: { password: string } = $props();

  const labels: Record<number, Key> = {
    1: "password.weak",
    2: "password.medium",
    3: "password.strong",
    4: "password.veryStrong",
  };

  const strength = $derived(passwordStrength(password));
</script>

{#if strength > 0}
  <div class="password-strength password-strength--{strength}">
    <div class="password-strength__bars" aria-hidden="true">
      {#each [1, 2, 3, 4] as level (level)}
        <span class="password-strength__bar" class:password-strength__bar--filled={level <= strength}></span>
      {/each}
    </div>
    <span class="password-strength__label" aria-live="polite">{t(labels[strength])}</span>
  </div>
{/if}

<style>
  .password-strength {
    --strength-color: #f6746b;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .password-strength--2 {
    --strength-color: #f3c611;
  }

  .password-strength--3,
  .password-strength--4 {
    --strength-color: var(--success-color);
  }

  .password-strength__bars {
    flex-grow: 1;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }

  .password-strength__bar {
    height: 4px;
    border-radius: 2px;
    background: var(--border-color);
    transition: background ease 0.2s;
  }

  .password-strength__bar--filled {
    background: var(--strength-color);
  }

  .password-strength__label {
    min-width: 72px;
    flex: none;
    text-align: right;
    font-size: var(--small-font-size);
    font-weight: 600;
    color: var(--strength-color);
  }
</style>
