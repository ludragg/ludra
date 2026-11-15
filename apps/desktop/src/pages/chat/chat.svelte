<script lang="ts">
  import { Sidebar } from "@/components";
  import { t } from "@/i18n";
  import { ConversationKind } from "@/protocol/ludra/v1/models_pb";
  import Friends from "@/pages/friends/friends.svelte";
  import Group from "@/pages/group/group.svelte";
  import GroupRinging from "@/pages/group/group-ringing.svelte";
  import Settings from "@/pages/settings/settings.svelte";
  import { calls } from "@/stores/call.svelte";
  import { chat } from "@/stores/chat.svelte";
  import { groupCall } from "@/stores/group-call.svelte";
  import { preferences } from "@/stores/preferences.svelte";
  import CallPanel from "./call-panel.svelte";
  import ChatComposer from "./chat-composer.svelte";
  import ChatHeader from "./chat-header.svelte";
  import ChatMessages from "./chat-messages.svelte";
  import IncomingCall from "./incoming-call.svelte";
</script>

<div class="chat">
  <Sidebar />

  <main class="chat__main">
    {#if chat.active && chat.active.kind === ConversationKind.GROUP}
      <Group group={chat.active} />
    {:else if chat.active?.peer}
      <ChatHeader peer={chat.active.peer} />
      {@const peerId = chat.active.peer.id}
      {@const call =
        calls.current?.peer.id === peerId ? calls.current : calls.waiting?.peer.id === peerId ? calls.waiting : null}
      {#if call}
        <CallPanel {call} />
      {/if}
      {#key chat.activeId}
        <ChatMessages />
        {#if chat.isFriend(chat.active.peer.id)}
          <ChatComposer recipient={chat.active.peer.username} />
        {:else}
          <p class="chat__locked">
            {chat.isBlocked(chat.active.peer.id)
              ? t("chat.youBlocked", { name: chat.active.peer.username })
              : t("chat.notFriends", { name: chat.active.peer.username })}
          </p>
        {/if}
      {/key}
    {:else if chat.view === "settings"}
      <Settings />
    {:else}
      <Friends />
    {/if}
  </main>
</div>

{#if preferences.values.callPopup}
  {#if calls.current?.status === "incoming" && !calls.current.quiet && !calls.current.hidden}
    <IncomingCall call={calls.current} />
  {:else if calls.waiting && !calls.waiting.quiet && !calls.waiting.hidden}
    <IncomingCall call={calls.waiting} />
  {:else if groupCall.ringing && !groupCall.ringing.hidden}
    <GroupRinging ringing={groupCall.ringing} />
  {/if}
{/if}

<style>
  .chat {
    height: 100%;
    display: flex;
  }

  .chat__main {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    background: linear-gradient(0deg, var(--dark-background-color) 50%, var(--background-color) 100%);
  }

  .chat__locked {
    margin: 0 var(--page-gutter) var(--page-gutter);
    padding: 14px;
    border-radius: 8px;
    background: var(--surface-color);
    border: 1px solid var(--border-color);
    color: var(--subtle-color);
    text-align: center;
  }
</style>
