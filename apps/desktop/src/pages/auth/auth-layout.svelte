<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button, Logo } from "@/components";
  import { openExternal, repositoryUrl } from "@/helpers/external";

  type Link = {
    prompt?: string;
    label: string;
    disabled?: boolean;
    onclick: () => void;
  };

  type Props = {
    title: string;
    subtitle: string | Snippet;
    submitLabel: string;
    submitting: boolean;
    links: Link[];
    onsubmit: () => void;
    fields: Snippet;
  };

  let { title, subtitle, submitLabel, submitting, links, onsubmit, fields }: Props = $props();

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!submitting) {
      onsubmit();
    }
  }
</script>

<main class="auth">
  <form class="auth__card" onsubmit={submit} novalidate>
    <header class="auth__header">
      <Logo size="large" />
      <h1 class="auth__title">{title}</h1>
      <p class="auth__subtitle">
        {#if typeof subtitle === "string"}
          {subtitle}
        {:else}
          {@render subtitle()}
        {/if}
      </p>
    </header>

    <div class="auth__fields">
      {@render fields()}
    </div>

    <Button type="submit" disabled={submitting}>{submitLabel}</Button>

    <div class="auth__links">
      {#each links as link, index (index)}
        <p class="auth__link">
          {link.prompt}
          <button type="button" class="auth__link-action" disabled={link.disabled} onclick={link.onclick}>
            {link.label}
          </button>
        </p>
      {/each}
    </div>
  </form>

  <a class="auth__github" href={repositoryUrl} target="_blank" rel="noreferrer" onclick={openExternal}>
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
    <span class="auth__github-label">GitHub</span>
  </a>
</main>

<style>
  .auth {
    height: 100%;
    overflow-y: auto;
    padding: 32px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: safe center;
    gap: 24px;
    background: linear-gradient(0deg, var(--dark-background-color) 50%, var(--background-color) 100%);
  }

  .auth__card {
    flex: none;
    width: 100%;
    max-width: 360px;
    padding: 32px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    border-radius: 8px;
    background: var(--dark-background-color);
    border: 1px solid var(--border-color);
  }

  .auth__header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    text-align: center;
  }

  .auth__title {
    margin: 12px 0 0;
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--muted-color);
  }

  .auth__subtitle {
    margin: 0;
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  .auth__fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .auth__links {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .auth__link {
    margin: 0;
    text-align: center;
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  .auth__link-action {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--muted-color);
    font-weight: 600;
  }

  .auth__link-action:hover:not(:disabled) {
    text-decoration: underline;
  }

  .auth__link-action:disabled {
    color: var(--subtle-color);
    font-weight: 400;
  }

  .auth__github {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--small-font-size);
    color: var(--subtle-color);
    text-decoration: none;
    transition: color ease 0.2s;
  }

  .auth__github:hover {
    color: var(--muted-color);
  }

  .auth__github svg {
    width: 14px;
  }

  .auth__github-label {
    line-height: 1;
    transform: translateY(1px);
  }
</style>
