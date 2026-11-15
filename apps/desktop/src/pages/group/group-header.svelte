<script lang="ts">
  import { GroupAvatar } from "@/components";
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import { maxGroupMembers } from "@/helpers/group-summary";
  import { t } from "@/i18n";
  import type { Conversation } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";
  import { groupCall } from "@/stores/group-call.svelte";

  let { group, onadd }: { group: Conversation; onadd: () => void } = $props();

  const busy = $derived(groupCall.joining);
  const full = $derived(group.members.length >= maxGroupMembers);

  function join() {
    if (chat.user) {
      groupCall.join(group.id, chat.user.id);
    }
  }
</script>

<header class="group-header">
  <GroupAvatar id={group.id} avatar={group.avatar} />
  <div class="group-header__info">
    <h1 class="group-header__name">{group.name}</h1>
    <span class="group-header__count">{t("group.memberCount", { count: group.members.length })}</span>
  </div>
  {#if chat.groupPhotoError?.conversationId === group.id}
    <span class="group-header__error" role="alert">{chat.groupPhotoError.message}</span>
  {:else if groupCall.error}
    <span class="group-header__error" role="alert">{groupCall.error}</span>
  {/if}
  {#if !busy && !group.call}
    <button class="group-header__action" aria-label={t("group.startCall")} title={t("group.startCall")} onclick={join}>
      <CallIcon name="phone" />
    </button>
  {/if}
  {#if !full}
    <button class="group-header__action" aria-label={t("group.addPeople")} title={t("group.addPeople")} onclick={onadd}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M19 8v6M22 11h-6" />
      </svg>
    </button>
  {/if}
</header>

<style>
  .group-header {
    padding: 12px var(--page-gutter);
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--border-color);
  }

  .group-header__info {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  .group-header__name {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 600;
    color: var(--muted-color);
  }

  .group-header__count {
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .group-header__error {
    font-size: var(--small-font-size);
    color: #f6746b;
  }

  .group-header__action {
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

  .group-header__action:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }
</style>
