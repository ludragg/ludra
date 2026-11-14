<script lang="ts">
  import type { User } from "@/protocol/ludra/v1/models_pb";
  import { avatarUrl } from "@/services/server";

  type Person = Pick<User, "id" | "username" | "avatar">;

  let { user, size = "medium" }: { user: Person; size?: "small" | "medium" | "large" | "huge" | "call" | "ringing" } =
    $props();

  let failed = $state<string | null>(null);

  const tone = $derived(parseInt(user.id.slice(-8), 16) % 6);
  const initial = $derived(user.username.charAt(0).toUpperCase());
  const source = $derived(user.avatar && failed !== user.avatar ? avatarUrl(user.id, user.avatar) : null);
</script>

{#if source}
  <img class="avatar avatar--{size}" src={source} alt="" onerror={() => (failed = user.avatar)} />
{:else}
  <span class="avatar avatar--{size} avatar--tone-{tone}" aria-hidden="true">{initial}</span>
{/if}

<style>
  .avatar {
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--dark-background-color);
    font-weight: 600;
    object-fit: cover;
  }

  .avatar--small {
    width: 32px;
    height: 32px;
    font-size: var(--hint-font-size);
  }

  .avatar--medium {
    width: 36px;
    height: 36px;
  }

  .avatar--large {
    width: 40px;
    height: 40px;
  }

  .avatar--huge {
    width: 72px;
    height: 72px;
    font-size: 26px;
  }

  .avatar--call {
    width: 80px;
    height: 80px;
    font-size: 28px;
  }

  .avatar--ringing {
    width: 88px;
    height: 88px;
    font-size: 32px;
  }

  .avatar--tone-0 {
    background: #16b195;
  }

  .avatar--tone-1 {
    background: #3e62c0;
    color: #ffffff;
  }

  .avatar--tone-2 {
    background: #f6746b;
  }

  .avatar--tone-3 {
    background: #d08a52;
  }

  .avatar--tone-4 {
    background: #30edc5;
  }

  .avatar--tone-5 {
    background: #f3c611;
  }
</style>
