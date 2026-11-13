<script lang="ts">
  import { Avatar, Status } from "@/components";
  import type { User } from "@/protocol/ludra/v1/models_pb";

  let { peer }: { peer: User } = $props();
</script>

<header class="chat-header">
  <Avatar user={peer} size="small" />
  <div class="chat-header__info">
    <h1 class="chat-header__name">{peer.username}</h1>
    <Status presence={peer.presence} />
  </div>
</header>

<style>
  .chat-header {
    padding: 12px var(--page-gutter);
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--border-color);
  }

  .chat-header__info {
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  .chat-header__name {
    margin: 0;
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 600;
    color: var(--muted-color);
  }
</style>
