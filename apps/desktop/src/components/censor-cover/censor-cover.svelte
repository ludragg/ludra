<script lang="ts">
  import { t } from "@/i18n";

  let { onuncensor }: { onuncensor: () => void } = $props();
</script>

<span class="censor-cover">
  <button
    type="button"
    class="censor-cover__button"
    onclick={(event) => {
      event.stopPropagation();
      onuncensor();
    }}
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
    {t("chat.uncensor")}
  </button>
</span>

<style>
  .censor-cover {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.28);
    pointer-events: none;
  }

  .censor-cover__button {
    height: 36px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 18px;
    background: rgba(13, 13, 13, 0.82);
    color: #f0f1f7;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: auto;
    transition: background ease 0.15s;
  }

  .censor-cover__button:hover {
    background: #0d0d0d;
  }

  .censor-cover__button svg {
    width: 16px;
  }
</style>
