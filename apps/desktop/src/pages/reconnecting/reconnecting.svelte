<script lang="ts">
  import { Logo } from "@/components";
  import { t } from "@/i18n";
</script>

<div class="reconnecting" role="status" aria-live="polite">
  <div class="reconnecting__content">
    <span class="reconnecting__spinner">
      <Logo size="small" />
    </span>
    <div class="reconnecting__text">
      <h1 class="reconnecting__title">{t("common.reconnecting")}</h1>
      <p class="reconnecting__hint">{t("common.reconnectingHint")}</p>
    </div>
  </div>
</div>

<style>
  .reconnecting {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
    background: linear-gradient(0deg, var(--dark-background-color) 50%, var(--background-color) 100%);
    animation: reconnecting-in 0.3s ease-out;
  }

  .reconnecting__content {
    max-width: 360px;
    padding: 0 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    text-align: center;
  }

  .reconnecting__spinner {
    position: relative;
    width: 72px;
    height: 72px;
    display: grid;
    place-items: center;
  }

  .reconnecting__spinner::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 3px solid var(--border-color);
    border-top-color: var(--brand-color);
    animation: reconnecting-spin 1s linear infinite;
  }

  .reconnecting__spinner :global(.logo) {
    animation: reconnecting-breathe 2s ease-in-out infinite;
  }

  .reconnecting__text {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .reconnecting__title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 600;
    color: var(--muted-color);
  }

  .reconnecting__hint {
    margin: 0;
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  @keyframes reconnecting-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes reconnecting-breathe {
    50% {
      opacity: 0.55;
    }
  }

  @keyframes reconnecting-in {
    from {
      opacity: 0;
    }
  }
</style>
