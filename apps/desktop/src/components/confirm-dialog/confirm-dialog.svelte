<script lang="ts">
  import Button from "@/components/button/button.svelte";
  import { t } from "@/i18n";

  let {
    title,
    description,
    confirmLabel,
    failure,
    onconfirm,
    onclose,
  }: {
    title: string;
    description: string;
    confirmLabel: string;
    failure: string;
    onconfirm: () => Promise<unknown>;
    onclose: () => void;
  } = $props();

  let pending = $state(false);
  let failed = $state(false);

  async function confirm() {
    if (pending) {
      return;
    }
    pending = true;
    failed = false;
    try {
      await onconfirm();
      onclose();
    } catch {
      failed = true;
      pending = false;
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!pending) {
        onclose();
      }
    }
  }

  function onpointerdown(event: PointerEvent) {
    if (event.target === event.currentTarget && !pending) {
      onclose();
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="confirm-dialog" role="presentation" {onpointerdown}>
  <div
    class="confirm-dialog__card"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="confirm-dialog-title"
    aria-describedby="confirm-dialog-description"
  >
    <div class="confirm-dialog__heading">
      <h2 id="confirm-dialog-title" class="confirm-dialog__title">{title}</h2>
      <span id="confirm-dialog-description" class="confirm-dialog__description">{description}</span>
    </div>
    {#if failed}
      <span class="confirm-dialog__error" role="alert">{failure}</span>
    {/if}
    <div class="confirm-dialog__actions" {@attach (actions) => actions.querySelector("button")?.focus()}>
      <Button theme="outline" size="small" disabled={pending} onclick={onclose}>{t("common.cancel")}</Button>
      <Button theme="danger" size="small" disabled={pending} onclick={confirm}>{confirmLabel}</Button>
    </div>
  </div>
</div>

<style>
  .confirm-dialog {
    position: fixed;
    inset: 32px 0 0;
    z-index: 10;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.6);
  }

  .confirm-dialog__card {
    width: 380px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--background-color);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
  }

  .confirm-dialog__heading {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .confirm-dialog__title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 600;
    color: var(--muted-color);
  }

  .confirm-dialog__description {
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  .confirm-dialog__error {
    font-size: var(--small-font-size);
    color: #f6746b;
  }

  .confirm-dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
