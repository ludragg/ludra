<script lang="ts">
  import type { Snippet } from "svelte";
  import { Avatar } from "@/components";
  import { presenceLabel } from "@/helpers/presence";
  import { FriendState, type Friend } from "@/protocol/ludra/v1/models_pb";

  let { friend, children }: { friend: Friend; children: Snippet } = $props();

  const user = $derived(friend.user!);
  const accepted = $derived(friend.state === FriendState.ACCEPTED);
</script>

<li class="friend-row">
  <Avatar {user} size="large" presence={accepted ? user.presence : undefined} />
  <div class="friend-row__info">
    <span class="friend-row__name">{user.username}</span>
    {#if accepted}
      <span class="friend-row__status">{presenceLabel(user.presence)}</span>
    {/if}
  </div>
  {@render children()}
</li>

<style>
  .friend-row {
    padding: 10px 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    gap: 12px;
    border-radius: 8px;
    transition: background ease 0.1s;
  }

  .friend-row:hover {
    --avatar-ring: var(--row-hover-color);
    border-top-color: transparent;
    background: var(--row-hover-color);
  }

  .friend-row__info {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  .friend-row__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    color: var(--muted-color);
  }

  .friend-row__status {
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }
</style>
