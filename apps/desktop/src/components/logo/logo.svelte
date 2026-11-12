<script lang="ts">
  let { size = "small" }: { size?: "small" | "large" } = $props();
</script>

<span class="logo logo--{size}" aria-hidden="true">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 4v16h10" />
  </svg>
</span>

<style>
  .logo {
    flex: none;
    display: grid;
    place-items: center;
    background: var(--brand-color);
    color: var(--dark-background-color);
  }

  .logo--small {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    stroke-width: 3;
  }

  .logo--small svg {
    width: 14px;
  }

  .logo--large {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    stroke-width: 2.8;
  }

  .logo--large svg {
    width: 22px;
  }
</style>
