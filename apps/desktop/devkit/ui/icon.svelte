<script lang="ts">
  type Name = "play" | "stop" | "restart" | "build" | "plus" | "more" | "copy" | "trash" | "check" | "cross" | "dash";

  let { name, size = 16 }: { name: Name; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === "play"}
    <path
      d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z"
      fill="currentColor"
      stroke="none"
    />
  {:else if name === "stop"}
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  {:else if name === "restart"}
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  {:else if name === "build"}
    <path
      d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
    />
  {:else if name === "plus"}
    <path d="M12 5v14M5 12h14" stroke-width="2.4" />
  {:else if name === "more"}
    <circle cx="12" cy="5" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1.8" fill="currentColor" stroke="none" />
  {:else if name === "copy"}
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  {:else if name === "trash"}
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
  {:else if name === "check"}
    <path d="M5 12l5 5L20 7" stroke-width="2.6" />
  {:else if name === "cross"}
    <path d="M6 6l12 12M18 6L6 18" stroke-width="2.6" />
  {:else}
    <path d="M8 12h8" stroke-width="2.6" />
  {/if}
</svg>
