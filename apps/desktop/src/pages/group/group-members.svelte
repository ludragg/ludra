<script lang="ts">
  import { Avatar, Status } from "@/components";
  import ActivityInline from "@/components/activity/activity-inline.svelte";
  import { t } from "@/i18n";
  import type { Conversation, User } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";
  import { presenceStore } from "@/stores/presence.svelte";
  import { profileStore } from "@/stores/profile.svelte";
  import UserMenu from "@/components/user-menu/user-menu.svelte";

  let { group }: { group: Conversation } = $props();

  let confirming = $state(false);
  let confirmingDelete = $state(false);
  let menu = $state<{ user: User; x: number; y: number } | null>(null);

  function openMenu(event: MouseEvent, user: User) {
    if (user.id === chat.user?.id) {
      return;
    }
    event.preventDefault();
    menu = { user, x: event.clientX, y: event.clientY };
  }

  $effect(() => {
    if (menu && !group.members.some(({ id }) => id === menu!.user.id)) {
      menu = null;
    }
  });

  async function transfer(user: User) {
    pending = true;
    await chat.transferGroup(group.id, user.id).catch(() => undefined);
    pending = false;
  }
  let pending = $state(false);

  const owner = $derived(group.ownerId === chat.user?.id);
  const members = $derived(
    [...group.members].sort((a, b) => Number(b.id === group.ownerId) - Number(a.id === group.ownerId)),
  );

  async function remove(user: User) {
    pending = true;
    await chat.removeGroupMember(group.id, user.id).catch(() => undefined);
    pending = false;
  }

  async function deleteGroup() {
    if (!confirmingDelete) {
      confirmingDelete = true;
      return;
    }
    pending = true;
    await chat.deleteGroup(group.id).catch(() => undefined);
    pending = false;
    confirmingDelete = false;
  }

  async function leave() {
    if (!confirming) {
      confirming = true;
      return;
    }
    pending = true;
    await chat.leaveGroup(group.id).catch(() => undefined);
    pending = false;
    confirming = false;
  }
</script>

<aside class="group-members" aria-label={t("group.members")}>
  <h2 class="group-members__title">{t("group.membersTitle", { count: group.members.length })}</h2>
  <ul class="group-members__list">
    {#each members as member (member.id)}
      {@const isMe = member.id === chat.user?.id}
      {@const memberPresence = presenceStore.getVisible(member.id)}
      {@const memberActivity = memberPresence.activity}
      {@const memberStatus = memberPresence.status}
      <li
        class="group-members__member"
        class:group-members__member--offline={memberStatus === "invisible"}
        oncontextmenu={(event) => openMenu(event, member)}
      >
        <button
          type="button"
          class="group-members__profile-btn"
          onclick={() => profileStore.openModal(member.id, member.username)}
        >
          <Avatar user={member} size="small" />
          <span class="group-members__info">
            <span class="group-members__name">
              <span class="group-members__username">{member.username}</span>
              {#if member.id === group.ownerId}
                <svg class="group-members__crown" viewBox="0 0 24 24" role="img" aria-label={t("group.owner")}>
                  <path d="M2 18h20l-2-11-5 4-3-7-3 7-5-4z" />
                </svg>
              {/if}
            </span>
            {#if memberActivity}
              <ActivityInline activity={memberActivity} />
            {:else}
              <Status status={memberStatus} labelOverride={!isMe && memberStatus === "invisible" ? "Offline" : ""} />
            {/if}
          </span>
        </button>
        {#if owner && member.id !== chat.user?.id}
          <button
            class="group-members__remove"
            aria-label={t("group.removeMember", { name: member.username })}
            data-tooltip={t("group.remove")}
            disabled={pending}
            onclick={() => remove(member)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        {/if}
      </li>
    {/each}
  </ul>
  <button class="group-members__leave" disabled={pending} onclick={leave} onblur={() => (confirming = false)}>
    {confirming ? t("group.confirmLeave") : t("group.leave")}
  </button>
  {#if owner}
    <button
      class="group-members__leave group-members__delete"
      disabled={pending}
      onclick={deleteGroup}
      onblur={() => (confirmingDelete = false)}
    >
      {confirmingDelete ? t("group.confirmDelete") : t("group.delete")}
    </button>
  {/if}
</aside>

{#if menu}
  {@const target = menu.user}
  <UserMenu
    user={target}
    x={menu.x}
    y={menu.y}
    ontransfer={owner ? () => transfer(target) : undefined}
    onclose={() => (menu = null)}
  />
{/if}

<style>
  .group-members {
    width: 220px;
    flex: none;
    padding: 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-left: 1px solid var(--border-color);
  }

  .group-members__title {
    margin: 0;
    padding: 0 8px 8px;
    font-size: var(--small-font-size);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--subtle-color);
  }

  .group-members__list {
    min-height: 0;
    margin: 0;
    padding: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
    list-style: none;
  }

  .group-members__member {
    padding: 6px 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-radius: 4px;
  }

  .group-members__member:hover {
    background: var(--surface-color);
  }

  .group-members__member--offline > :global(.avatar),
  .group-members__member--offline .group-members__info {
    opacity: 0.55;
  }

  .group-members__info {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  .group-members__name {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 600;
    color: var(--muted-color);
  }

  .group-members__username {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-members__crown {
    width: 13px;
    flex: none;
    fill: #f3c611;
  }

  .group-members__remove {
    width: 28px;
    height: 28px;
    padding: 7px;
    flex: none;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--subtle-color);
    opacity: 0;
    transition: all ease 0.1s;
  }

  .group-members__member:hover .group-members__remove,
  .group-members__remove:focus-visible {
    opacity: 1;
  }

  .group-members__remove:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .group-members__leave {
    height: 32px;
    margin-top: 8px;
    flex: none;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: transparent;
    color: #f6746b;
    font-size: var(--hint-font-size);
    font-weight: 600;
    transition: all ease 0.1s;
  }

  .group-members__delete {
    margin-top: 6px;
    border-color: transparent;
    background: rgba(225, 29, 72, 0.12);
  }

  .group-members__leave:hover {
    background: rgba(246, 116, 107, 0.1);
  }
  .group-members__profile-btn {
    min-width: 0;
    flex-grow: 1;
    padding: 0;
    border: 0;
    background: transparent;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    color: inherit;
    cursor: pointer;
  }

  .group-members__profile-btn:hover .group-members__username {
    color: #c4b5fd;
    text-decoration: underline;
  }
</style>
