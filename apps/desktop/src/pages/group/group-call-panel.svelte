<script lang="ts">
  import { onDestroy } from "svelte";
  import { Avatar } from "@/components";
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import { Elapsed } from "@/helpers/duration.svelte";
  import { toDate } from "@/helpers/time";
  import { t } from "@/i18n";
  import type { Conversation, User } from "@/protocol/ludra/v1/models_pb";
  import CallVolumeMenu from "@/pages/chat/call-volume-menu.svelte";
  import { chat } from "@/stores/chat.svelte";
  import { preferences } from "@/stores/preferences.svelte";
  import { groupCall, type GroupCurrent } from "@/stores/group-call.svelte";

  let { call, group }: { call: GroupCurrent | null; group: Conversation } = $props();

  let menu = $state<{ user: User; x: number; y: number } | null>(null);

  const elapsed = new Elapsed();
  onDestroy(() => elapsed.stop());

  const people = $derived.by(() => {
    const participants = call?.participantIds ?? group.call?.participantIds ?? [];
    const ringingIds = (group.call?.ringingIds ?? []).filter((id) => !participants.includes(id));
    return [...participants, ...ringingIds].map((id) => {
      const user = id === chat.user?.id ? chat.user : group.members.find((member) => member.id === id);
      const self = id === chat.user?.id;
      const state = call ? groupCall.states[id] : undefined;
      return {
        id,
        user: { id, username: user?.username ?? chat.nameOf(id), avatar: user?.avatar ?? "" } as User,
        self,
        muted: call && self ? groupCall.muted : (state?.muted ?? !!group.call?.mutedIds.includes(id)),
        deafened: call && self ? groupCall.deafened : (state?.deafened ?? !!group.call?.deafenedIds.includes(id)),
        speaking: !!call && groupCall.speaking.has(id),
        ringing: ringingIds.includes(id),
      };
    });
  });

  const ringing = $derived(groupCall.ringing?.conversationId === group.id ? groupCall.ringing : null);
  const startedAt = $derived(group.call?.startedAt ? toDate(group.call.startedAt).getTime() : null);

  function join() {
    if (chat.user) {
      groupCall.join(group.id, chat.user.id);
    }
  }

  function openMenu(event: MouseEvent, user: User) {
    event.preventDefault();
    menu = { user, x: event.clientX, y: event.clientY };
  }

  function menuKey(event: KeyboardEvent, user: User) {
    if (event.key === "Enter" || event.key === "ContextMenu") {
      event.preventDefault();
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
      menu = { user, x: box.left, y: box.bottom + 8 };
    }
  }
</script>

<section class="group-call" aria-label={t("group.callPanel")}>
  <div class="group-call__people">
    {#each people as person (person.id)}
      <div class="group-call__person">
        <span
          class="group-call__avatar"
          class:group-call__avatar--speaking={person.speaking && !person.muted}
          class:group-call__avatar--ringing={person.ringing}
        >
          {#if person.self || person.ringing || !call}
            <Avatar user={person.user} size="group" />
          {:else}
            <button
              class="group-call__adjust"
              aria-haspopup="dialog"
              aria-label={t("call.userVolume", { name: person.user.username })}
              oncontextmenu={(event) => openMenu(event, person.user)}
              onkeydown={(event) => menuKey(event, person.user)}
            >
              <Avatar user={person.user} size="group" />
            </button>
          {/if}
          {#if person.deafened || person.muted}
            <span
              class="group-call__badge"
              role="img"
              aria-label={person.deafened
                ? t("call.peerDeafened", { name: person.user.username })
                : t("call.peerMuted", { name: person.user.username })}
            >
              <CallIcon name={person.deafened ? "headphonesOff" : "micOff"} />
            </span>
          {/if}
        </span>
      </div>
    {/each}
  </div>
  {#if call}
    <span class="group-call__status" aria-live="polite">{elapsed.format(startedAt ?? call.startedAt)}</span>
  {/if}
  {#if !call}
    <div class="group-call__controls">
      {#if ringing}
        <button
          class="group-call__button group-call__button--leave"
          aria-label={t("call.decline")}
          title={t("call.decline")}
          onclick={() => groupCall.decline()}
        >
          <CallIcon name="hangUp" />
        </button>
        {#if !ringing.hidden && preferences.values.callSounds}
          <button
            class="group-call__button"
            aria-label={t("call.hide")}
            title={t("call.hide")}
            onclick={() => groupCall.hide()}
          >
            <CallIcon name="dash" />
          </button>
        {/if}
      {/if}
      <button
        class="group-call__button group-call__button--join"
        aria-label={t("group.joinCallShort")}
        title={t("group.joinCallShort")}
        disabled={groupCall.joining}
        onclick={join}
      >
        <CallIcon name="phone" />
      </button>
    </div>
  {:else}
    <div class="group-call__controls">
      <button
        class="group-call__button"
        class:group-call__button--off={groupCall.muted}
        aria-label={groupCall.muted ? t("call.unmute") : t("call.mute")}
        title={groupCall.muted ? t("call.unmute") : t("call.mute")}
        aria-pressed={groupCall.muted}
        onclick={() => groupCall.toggleMute()}
      >
        <CallIcon name={groupCall.muted ? "micOff" : "mic"} />
      </button>
      <button
        class="group-call__button"
        class:group-call__button--off={groupCall.deafened}
        aria-label={groupCall.deafened ? t("call.undeafen") : t("call.deafen")}
        title={groupCall.deafened ? t("call.undeafen") : t("call.deafen")}
        aria-pressed={groupCall.deafened}
        onclick={() => groupCall.toggleDeafen()}
      >
        <CallIcon name={groupCall.deafened ? "headphonesOff" : "headphones"} />
      </button>
      <button
        class="group-call__button group-call__button--leave"
        aria-label={t("group.leaveCall")}
        title={t("group.leaveCall")}
        onclick={() => groupCall.leave()}
      >
        <CallIcon name="hangUp" />
      </button>
    </div>
  {/if}
</section>

{#if menu}
  <CallVolumeMenu user={menu.user} x={menu.x} y={menu.y} onclose={() => (menu = null)} />
{/if}

<style>
  .group-call {
    padding: 24px var(--page-gutter);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    background: #090909;
    border-bottom: 1px solid var(--border-color);
  }

  .group-call__people {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 20px;
  }

  .group-call__person {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .group-call__avatar {
    position: relative;
    display: flex;
    border-radius: 50%;
    box-shadow:
      0 0 0 3px #090909,
      0 0 0 6px transparent;
    transition: box-shadow ease 0.15s;
  }

  .group-call__avatar--speaking {
    box-shadow:
      0 0 0 3px #090909,
      0 0 0 6px var(--success-color);
  }

  .group-call__adjust {
    padding: 0;
    display: flex;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: context-menu;
  }

  .group-call__badge {
    position: absolute;
    right: -4px;
    bottom: -4px;
    width: 24px;
    height: 24px;
    padding: 5px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--dark-background-color);
    border: 2px solid #090909;
    color: #f6746b;
  }

  .group-call__status {
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
    font-variant-numeric: tabular-nums;
  }

  .group-call__controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .group-call__button {
    width: 48px;
    height: 48px;
    padding: 14px;
    flex: none;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    color: var(--muted-color);
    transition: background ease 0.1s;
  }

  .group-call__button:hover {
    background: rgba(255, 255, 255, 0.14);
  }

  .group-call__button--off,
  .group-call__button--off:hover {
    background: var(--muted-color);
    color: var(--dark-background-color);
  }

  .group-call__button--leave,
  .group-call__button--leave:hover {
    background: var(--error-color);
    color: #ffffff;
  }

  .group-call__button--leave:hover {
    background: #c8173f;
  }

  .group-call__button--join,
  .group-call__button--join:hover {
    background: var(--success-color);
    color: #ffffff;
  }

  .group-call__button--join:hover:not(:disabled) {
    background: #178540;
  }

  .group-call__button--join:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .group-call__avatar--ringing {
    animation: group-call__avatar-ringing 1.4s ease-out infinite;
  }

  .group-call__avatar--ringing :global(.avatar) {
    filter: saturate(0.2) brightness(0.75);
  }

  @keyframes group-call__avatar-ringing {
    from {
      box-shadow:
        0 0 0 3px #090909,
        0 0 0 3px rgba(142, 145, 155, 0.7);
    }
    to {
      box-shadow:
        0 0 0 3px #090909,
        0 0 0 14px rgba(142, 145, 155, 0);
    }
  }
</style>
