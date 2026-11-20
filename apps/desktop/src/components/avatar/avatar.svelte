<script lang="ts">
  import type { User } from "@/protocol/ludra/v1/models_pb";
  import { avatarUrl } from "@/services/server";
  import { profileStore } from "@/stores/profile.svelte";

  type Person = Pick<User, "id" | "username" | "avatar">;

  let { user, size = "medium" }: { user: Person; size?: "small" | "medium" | "large" | "huge" | "ringing" | "fill" } =
    $props();

  let failed = $state<string | null>(null);

  const cachedProfile = $derived(profileStore.cache[user.id]);
  const rawAvatar = $derived(cachedProfile?.avatar || user.avatar || "");
  const displayName = $derived(cachedProfile?.displayName || user.username);

  const tone = $derived(parseInt(user.id.slice(-8), 16) % 6);
  const initial = $derived(displayName.charAt(0).toUpperCase() || "?");
  const source = $derived.by(() => {
    if (!rawAvatar || failed === rawAvatar) return null;
    if (rawAvatar.startsWith("data:") || rawAvatar.startsWith("blob:") || rawAvatar.startsWith("http")) {
      return rawAvatar;
    }
    return avatarUrl(user.id, rawAvatar);
  });
</script>

{#if source}
  <img class="avatar avatar--{size}" src={source} alt="" onerror={() => (failed = rawAvatar)} />
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

  .avatar--ringing {
    width: 88px;
    height: 88px;
    font-size: 32px;
  }

  .avatar--fill {
    width: 100%;
    height: 100%;
    font-size: calc(var(--size, 80px) * 0.36);
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
