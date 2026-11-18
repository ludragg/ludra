<script lang="ts">
  import { groupAvatarUrl } from "@/services/server";

  let {
    id,
    avatar = "",
    size = "small",
  }: { id: string; avatar?: string; size?: "small" | "large" | "ringing" | "fill" } = $props();

  let failed = $state<string | null>(null);

  const tone = $derived(parseInt(id.slice(-8), 16) % 6);
  const source = $derived(avatar && failed !== avatar ? groupAvatarUrl(id, avatar) : null);
</script>

{#if source}
  <img
    class="group-avatar group-avatar--{size} group-avatar--photo"
    src={source}
    alt=""
    onerror={() => (failed = avatar)}
  />
{:else}
  <span class="group-avatar group-avatar--{size} group-avatar--tone-{tone}" aria-hidden="true">
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  </span>
{/if}

<style>
  .group-avatar {
    width: 32px;
    height: 32px;
    padding: 8px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--dark-background-color);
  }

  .group-avatar--large {
    width: 40px;
    height: 40px;
    padding: 10px;
  }

  .group-avatar--ringing {
    width: 88px;
    height: 88px;
    padding: 22px;
  }

  .group-avatar--fill {
    width: 100%;
    height: 100%;
    padding: 12px;
    border-radius: 0;
  }

  .group-avatar--photo {
    padding: 0;
    object-fit: cover;
  }

  .group-avatar--tone-0 {
    background: #16b195;
  }

  .group-avatar--tone-1 {
    background: #3e62c0;
    color: #ffffff;
  }

  .group-avatar--tone-2 {
    background: #f6746b;
  }

  .group-avatar--tone-3 {
    background: #d08a52;
  }

  .group-avatar--tone-4 {
    background: #30edc5;
  }

  .group-avatar--tone-5 {
    background: #f3c611;
  }
</style>
