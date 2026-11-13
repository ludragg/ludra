<script lang="ts">
  type Icon = "message" | "remove" | "accept" | "decline";

  let { icon, label, onclick }: { icon: Icon; label: string; onclick: () => void } = $props();

  const paths: Record<Icon, string[]> = {
    message: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
    remove: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z", "M17 11h6"],
    accept: ["M5 12l5 5L20 7"],
    decline: ["M6 6l12 12M18 6L6 18"],
  };

  const tone = $derived(icon === "accept" ? "accept" : icon === "message" ? "neutral" : "danger");
</script>

<button class="friend-action friend-action--{tone}" aria-label={label} title={label} {onclick}>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={icon === "accept" || icon === "decline" ? 2.4 : 2}
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {#each paths[icon] as path (path)}
      <path d={path} />
    {/each}
  </svg>
</button>

<style>
  .friend-action {
    width: 36px;
    height: 36px;
    flex: none;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
    color: var(--body-color);
    transition: all ease 0.1s;
  }

  .friend-action:hover {
    background: rgba(255, 255, 255, 0.12);
    color: var(--muted-color);
  }

  .friend-action--accept:hover {
    color: var(--success-color);
  }

  .friend-action--danger:hover {
    color: #f6746b;
  }

  .friend-action svg {
    width: 16px;
  }
</style>
