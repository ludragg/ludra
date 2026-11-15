<script lang="ts">
  import type { Conversation } from "@/protocol/ludra/v1/models_pb";
  import ChatComposer from "@/pages/chat/chat-composer.svelte";
  import ChatMessages from "@/pages/chat/chat-messages.svelte";
  import { groupCall } from "@/stores/group-call.svelte";
  import GroupCallPanel from "./group-call-panel.svelte";
  import GroupDialog from "./group-dialog.svelte";
  import GroupHeader from "./group-header.svelte";
  import GroupMembers from "./group-members.svelte";

  let { group }: { group: Conversation } = $props();

  let adding = $state(false);

  const joined = $derived(groupCall.current?.conversationId === group.id ? groupCall.current : null);
</script>

<GroupHeader {group} onadd={() => (adding = true)} />
{#if joined || group.call}
  <GroupCallPanel call={joined} {group} />
{/if}
<div class="group">
  <div class="group__chat">
    {#key group.id}
      <ChatMessages />
      <ChatComposer recipient={group.name} />
    {/key}
  </div>
  <GroupMembers {group} />
</div>

{#if adding}
  <GroupDialog {group} onclose={() => (adding = false)} />
{/if}

<style>
  .group {
    min-height: 0;
    flex-grow: 1;
    display: flex;
  }

  .group__chat {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
  }
</style>
