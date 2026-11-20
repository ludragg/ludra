<script lang="ts">
  let {
    src = "",
    name,
    size = 40,
    radius = 10,
  }: {
    src?: string;
    name: string;
    size?: number;
    radius?: number;
  } = $props();

  let failedFor = $state<string | null>(null);

  const showImage = $derived(Boolean(src) && failedFor !== src);
  const initial = $derived(name.trim().charAt(0).toUpperCase() || "?");
</script>

{#if showImage}
  <img
    class="game-icon game-icon--img"
    {src}
    alt={name}
    width={size}
    height={size}
    loading="lazy"
    draggable="false"
    style:width="{size}px"
    style:height="{size}px"
    style:border-radius="{radius}px"
    onerror={() => (failedFor = src)}
  />
{:else}
  <span
    class="game-icon game-icon--fallback"
    role="img"
    aria-label={name}
    title={name}
    style:width="{size}px"
    style:height="{size}px"
    style:border-radius="{radius}px"
  >
    {#if size <= 20}
      <svg
        class="game-icon__pad game-icon__pad--sm"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="6" y1="11" x2="10" y2="11" />
        <line x1="8" y1="9" x2="8" y2="13" />
        <line x1="15" y1="12" x2="15.01" y2="12" />
        <line x1="18" y1="10" x2="18.01" y2="10" />
        <path
          d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"
        />
      </svg>
    {:else}
      <svg
        class="game-icon__pad"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="6" y1="11" x2="10" y2="11" />
        <line x1="8" y1="9" x2="8" y2="13" />
        <line x1="15" y1="12" x2="15.01" y2="12" />
        <line x1="18" y1="10" x2="18.01" y2="10" />
        <path
          d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"
        />
      </svg>
      <span class="game-icon__initial">{initial}</span>
    {/if}
  </span>
{/if}

<style>
  .game-icon {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: #181826;
  }

  .game-icon--img {
    object-fit: cover;
  }

  .game-icon--fallback {
    position: relative;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.32), #151522);
    border: 1px solid rgba(139, 92, 246, 0.4);
    color: #c4b5fd;
    flex-direction: column;
    gap: 1px;
  }

  .game-icon__pad {
    width: 44%;
    height: 44%;
    color: #a78bfa;
  }

  .game-icon__pad--sm {
    width: 78%;
    height: 78%;
    color: #22c55e;
  }

  .game-icon__initial {
    font-family: var(--font-display);
    font-size: 11px;
    font-weight: 800;
    color: #ffffff;
    line-height: 1;
  }
</style>
