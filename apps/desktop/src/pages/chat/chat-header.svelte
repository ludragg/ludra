<script lang="ts">
  import { Avatar, Status } from "@/components";
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import { t } from "@/i18n";
  import type { User } from "@/protocol/ludra/v1/models_pb";
  import { calls } from "@/stores/call.svelte";
  import { chat } from "@/stores/chat.svelte";

  let { peer }: { peer: User } = $props();

  const canCall = $derived(!calls.current && chat.isFriend(peer.id));
</script>

<header class="chat-header">
  <Avatar user={peer} size="small" />
  <div class="chat-header__info">
    <h1 class="chat-header__name">{peer.username}</h1>
    <Status presence={peer.presence} />
  </div>
  {#if calls.error}
    <span class="chat-header__error" role="alert">{calls.error}</span>
  {/if}
  {#if canCall}
    <button
      class="chat-header__call"
      aria-label={t("call.start")}
      title={t("call.start")}
      onclick={() => calls.start(peer)}
    >
      <CallIcon name="phone" />
    </button>
  {/if}
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
    flex-grow: 1;
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

  .chat-header__error {
    font-size: var(--small-font-size);
    color: #f6746b;
  }

  .chat-header__call {
    width: 36px;
    height: 36px;
    padding: 9px;
    flex: none;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--subtle-color);
    transition: all ease 0.1s;
  }

  .chat-header__call:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }
</style>
