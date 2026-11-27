<script lang="ts">
  import { t } from "@/i18n";

  let { variant, onclick }: { variant: "overlay" | "row" | "compact" | "viewer"; onclick: () => void } = $props();
</script>

<button
  type="button"
  class="folder-button folder-button--{variant}"
  aria-label={t("chat.openFolder")}
  data-tooltip={t("chat.openFolder")}
  onclick={(event) => {
    event.stopPropagation();
    onclick();
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
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
</button>

<style>
  .folder-button {
    flex: none;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    transition:
      background ease 0.15s,
      color ease 0.15s;
  }

  .folder-button--overlay {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 2;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    color: #f0f1f7;
  }

  .folder-button--overlay:hover {
    background: rgba(0, 0, 0, 0.8);
  }

  .folder-button--overlay svg {
    width: 14px;
  }

  .folder-button--row {
    width: 36px;
    height: 36px;
    color: var(--muted-color);
  }

  .folder-button--row:hover {
    background: var(--active-color);
  }

  .folder-button--row svg {
    width: 18px;
  }

  .folder-button--compact {
    width: 28px;
    height: 28px;
    color: var(--muted-color);
  }

  .folder-button--compact:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .folder-button--compact svg {
    width: 16px;
  }

  .folder-button--viewer {
    width: 36px;
    height: 36px;
    color: var(--body-color);
  }

  .folder-button--viewer:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .folder-button--viewer svg {
    width: 18px;
  }
</style>
