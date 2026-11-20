<script lang="ts">
  import { Sidebar } from "@/components";
  import DropZone from "@/components/drop-zone/drop-zone.svelte";
  import ServerBar from "@/components/server-bar/server-bar.svelte";
  import StreamAudio from "@/components/stream-audio/stream-audio.svelte";
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
  <ServerBar />
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
        {#if chat.isFriend(chat.active.peer.id)}
          <div class="chat__thread">
            <ChatMessages />
            <ChatComposer recipient={chat.active.peer.username} />
            <DropZone target={chat.active.peer.username} />
          </div>
        {:else}
          <ChatMessages />
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

{#if calls.current && calls.watching}
  <StreamAudio stream={calls.screen} userId={calls.current.peer.id} />
{:else if groupCall.watchingId}
  <StreamAudio stream={groupCall.screen} userId={groupCall.watchingId} />
{/if}

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

  .chat__thread {
    position: relative;
    min-height: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
  }

  .chat__main {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    background: var(--background-color);
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
