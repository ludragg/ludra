<script lang="ts">
  import type { Snippet } from "svelte";
  import { Avatar, Status } from "@/components";
  import { FriendState, type Friend } from "@/protocol/ludra/v1/models_pb";

  let { friend, children }: { friend: Friend; children: Snippet } = $props();

  const user = $derived(friend.user!);
</script>

<li class="friend-row">
  <Avatar {user} />
  <div class="friend-row__info">
    <span class="friend-row__name">{user.username}</span>
    {#if friend.state === FriendState.ACCEPTED}
      <Status presence={user.presence} />
    {/if}
  </div>
  {@render children()}
</li>

<style>
  .friend-row {
    padding: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-radius: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    transition: background ease 0.1s;
  }

  .friend-row:hover {
    background: var(--surface-color);
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
</style>
