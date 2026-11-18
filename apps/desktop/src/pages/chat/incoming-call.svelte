<script lang="ts">
  import { Avatar } from "@/components";
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import { t } from "@/i18n";
  import { calls, type Current } from "@/stores/call.svelte";

  let { call }: { call: Current } = $props();

  const peer = $derived(call.peer);
</script>

<div class="incoming-call">
  <div class="incoming-call__card" role="alertdialog" aria-label={t("call.incomingDialog")}>
    <span class="incoming-call__avatar"><Avatar user={peer} size="ringing" /></span>
    <div class="incoming-call__text">
      <span class="incoming-call__name">{peer.username}</span>
      <span class="incoming-call__hint">{t("call.incoming")}</span>
    </div>
    <div class="incoming-call__actions">
      <button
        class="incoming-call__button incoming-call__button--decline"
        aria-label={t("call.decline")}
        data-tooltip={t("call.decline")}
        onclick={() => calls.decline()}
      >
        <CallIcon name="hangUp" />
      </button>
      <button
        class="incoming-call__button incoming-call__button--hide"
        aria-label={t("call.hide")}
        data-tooltip={t("call.hide")}
        onclick={() => calls.hide()}
      >
        <CallIcon name="dash" />
      </button>
      <button
        class="incoming-call__button incoming-call__button--answer"
        aria-label={t("call.answer")}
        data-tooltip={t("call.answer")}
        onclick={() => calls.answer()}
        {@attach (button) => button.focus()}
      >
        <CallIcon name="phone" />
      </button>
    </div>
  </div>
</div>

<style>
  .incoming-call {
    position: fixed;
    inset: 32px 0 0;
    z-index: 10;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.6);
  }

  .incoming-call__card {
    width: 280px;
    padding: 32px 24px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    border-radius: 12px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
    text-align: center;
  }

  .incoming-call__avatar {
    display: flex;
    border-radius: 50%;
    animation: incoming-call-ring 1.4s ease-out infinite;
  }

  .incoming-call__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .incoming-call__name {
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 600;
    color: var(--muted-color);
  }

  .incoming-call__hint {
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  .incoming-call__actions {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .incoming-call__button {
    width: 48px;
    height: 48px;
    padding: 14px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    color: #ffffff;
    transition: background ease 0.1s;
  }

  .incoming-call__button--hide {
    background: rgba(255, 255, 255, 0.08);
    color: var(--muted-color);
  }

  .incoming-call__button--hide:hover {
    background: rgba(255, 255, 255, 0.14);
  }

  .incoming-call__button--decline {
    background: var(--error-color);
  }

  .incoming-call__button--decline:hover {
    background: #c8173f;
  }

  .incoming-call__button--answer {
    background: var(--success-color);
  }

  .incoming-call__button--answer:hover {
    background: #178540;
  }

  @keyframes incoming-call-ring {
    from {
      box-shadow: 0 0 0 0 rgba(28, 151, 73, 0.5);
    }
    to {
      box-shadow: 0 0 0 18px rgba(28, 151, 73, 0);
    }
  }
</style>
