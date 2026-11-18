<script lang="ts">
  type Icon = "message" | "more" | "remove" | "accept" | "decline" | "block" | "unblock";

  let {
    icon,
    label,
    armed = false,
    onclick,
  }: { icon: Icon; label: string; armed?: boolean; onclick: (event: MouseEvent) => void } = $props();

  const paths: Record<Icon, string[]> = {
    message: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
    more: ["M12 5h.01", "M12 12h.01", "M12 19h.01"],
    remove: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z", "M17 11h6"],
    accept: ["M5 12l5 5L20 7"],
    decline: ["M6 6l12 12M18 6L6 18"],
    block: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M4.93 4.93l14.14 14.14"],
    unblock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M4.93 4.93l14.14 14.14"],
  };

  const tone = $derived(
    icon === "accept" || icon === "unblock" ? "accept" : icon === "message" || icon === "more" ? "neutral" : "danger",
  );
</script>

<button
  class="friend-action friend-action--{tone}"
  class:friend-action--armed={armed}
  aria-label={label}
  data-tooltip={label}
  {onclick}
>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={icon === "more" ? 3.2 : icon === "accept" || icon === "decline" ? 2.4 : 2}
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
    background: var(--sidebar-color);
    color: var(--subtle-color);
    transition: all ease 0.1s;
  }

  .friend-action:hover {
    background: var(--rail-color);
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

  .friend-action--armed,
  .friend-action--armed:hover {
    background: var(--error-color);
    color: #ffffff;
  }
</style>
