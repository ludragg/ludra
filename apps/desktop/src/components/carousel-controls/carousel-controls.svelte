<script lang="ts">
  import { t } from "@/i18n";

  let { position, onprevious, onnext }: { position: string; onprevious: () => void; onnext: () => void } = $props();
</script>

<button
  type="button"
  class="carousel-controls__arrow carousel-controls__arrow--previous"
  aria-label={t("chat.previous")}
  onclick={onprevious}
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
    <path d="M15 6l-6 6 6 6" />
  </svg>
</button>
<button
  type="button"
  class="carousel-controls__arrow carousel-controls__arrow--next"
  aria-label={t("chat.next")}
  onclick={onnext}
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
    <path d="M9 6l6 6-6 6" />
  </svg>
</button>
<span class="carousel-controls__count">{position}</span>

<style>
  .carousel-controls__arrow {
    position: absolute;
    top: 50%;
    z-index: 1;
    width: 40px;
    height: 40px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 1px solid var(--border-color);
    border-radius: 50%;
    background: var(--dark-background-color);
    color: var(--body-color);
    transform: translateY(-50%);
    transition:
      background ease 0.15s,
      color ease 0.15s;
  }

  .carousel-controls__arrow:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .carousel-controls__arrow--previous {
    left: 14px;
  }

  .carousel-controls__arrow--next {
    right: 14px;
  }

  .carousel-controls__arrow svg {
    width: 18px;
  }

  .carousel-controls__count {
    position: absolute;
    bottom: 10px;
    left: 50%;
    z-index: 1;
    padding: 4px 12px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--dark-background-color);
    font-size: var(--small-font-size);
    font-variant-numeric: tabular-nums;
    color: var(--body-color);
    transform: translateX(-50%);
  }
</style>
