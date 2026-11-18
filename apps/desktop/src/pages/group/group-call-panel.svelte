<script lang="ts">
  import { onDestroy } from "svelte";
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import CallTile from "@/components/call-tile/call-tile.svelte";
  import CallSecurity from "@/components/call-security/call-security.svelte";
  import ScreenPicker from "@/components/screen-picker/screen-picker.svelte";
  import ResizeHandle from "@/components/resize-handle/resize-handle.svelte";
  import ScreenPreview from "@/components/screen-preview/screen-preview.svelte";
  import ScreenView from "@/components/screen-view/screen-view.svelte";
  import { Elapsed } from "@/helpers/duration.svelte";
  import { fitTiles } from "@/helpers/tiles";
  import { toDate } from "@/helpers/time";
  import { t } from "@/i18n";
  import type { Conversation, User } from "@/protocol/ludra/v1/models_pb";
  import CallVolumeMenu from "@/pages/chat/call-volume-menu.svelte";
  import { chat } from "@/stores/chat.svelte";
  import { preferences } from "@/stores/preferences.svelte";
  import { groupCall, type GroupCurrent } from "@/stores/group-call.svelte";

  let { call, group }: { call: GroupCurrent | null; group: Conversation } = $props();

  let menu = $state<{ user: User; x: number; y: number } | null>(null);
  let picking = $state(false);

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
        live: call && self ? groupCall.sharing : state ? !!state.sharing : !!group.call?.sharingIds.includes(id),
        quality: state?.sharing ?? "",
        camera: !call ? null : self ? groupCall.camera : (groupCall.cameras[id] ?? null),
        cameraOn: call ? (self ? !!groupCall.camera : !!state?.camera) : !!group.call?.cameraIds.includes(id),
      };
    });
  });

  const watched = $derived(people.find(({ id }) => id === groupCall.watchingId) ?? null);
  const watchers = $derived.by(() => {
    if (!call || !watched || !chat.user) {
      return [];
    }
    const ids = new Set([...(groupCall.states[watched.id]?.viewers ?? []), chat.user.id]);
    return [...ids].filter((id) => call.participantIds.includes(id)).map((id) => chat.nameOf(id));
  });
  const sharers = $derived(people.filter(({ live, self, id }) => live && !self && id !== groupCall.watchingId));
  const previewCount = $derived(sharers.length + Number(!!call && groupCall.sharing));

  function previewWidth(count: number): number {
    return count <= 1 ? 144 : count === 2 ? 112 : 88;
  }

  const ringing = $derived(groupCall.ringing?.conversationId === group.id ? groupCall.ringing : null);
  const startedAt = $derived(group.call?.startedAt ? toDate(group.call.startedAt).getTime() : null);

  function join() {
    if (chat.user) {
      groupCall.join(group.id, chat.user.id);
    }
  }

  function watchSharer(peerId: string) {
    if (call) {
      groupCall.watch(peerId);
    } else if (chat.user) {
      groupCall.joinWatching(group.id, chat.user.id, peerId);
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

  const watchMinimum = 320;
  const watchingNow = $derived(!!(call && watched));
  const squares = $derived(people.some(({ camera }) => !!camera));
  const morphKey = $derived(people.map(({ id, camera }) => `${id}${camera ? "+" : ""}`).join());
  let morphing = $state(false);
  let morphTimer: number | undefined;

  $effect.pre(() => {
    void morphKey;
    morphing = true;
    window.clearTimeout(morphTimer);
    morphTimer = window.setTimeout(() => (morphing = false), 300);
  });

  $effect(() => () => window.clearTimeout(morphTimer));
  const panelHeight = $derived.by(() => {
    const height = watchingNow ? Math.max(watchMinimum, preferences.values.watchHeight) : preferences.values.callHeight;
    return height ? `${height}px` : undefined;
  });
  const previewInset = $derived(!watchingNow && previewCount > 0 ? previewWidth(previewCount) + 24 : 0);
  const sideWidth = $derived(`${Math.max(previewCount > 0 ? previewWidth(previewCount) : 0, 76)}px`);

  const tileBase = 64;
  const tileMax = 240;
  const tileGap = 20;
  const tileRoom = 16;

  let peopleWidth = $state(0);
  let peopleHeight = $state(0);

  const layout = $derived(
    fitTiles(people.length, peopleWidth - 2 * previewInset, peopleHeight - tileRoom, tileBase, tileMax, tileGap),
  );
</script>

<section
  class="group-call"
  class:group-call--watching={!!(call && watched)}
  style:height={panelHeight}
  style:--previews-space="{previewInset}px"
  style:--side={sideWidth}
  aria-label={t("group.callPanel")}
>
  {#if call && watched}
    <div class="group-call__stage">
      <ScreenView
        stream={groupCall.screen}
        userId={watched.id}
        name={watched.user.username}
        quality={watched.quality}
        viewers={watchers}
        onclose={() => groupCall.unwatch()}
      />
    </div>
  {/if}
  <div
    class="group-call__people"
    class:group-call__people--squares={squares}
    class:group-call__people--morphing={morphing}
    bind:clientWidth={peopleWidth}
    bind:clientHeight={peopleHeight}
    style:--tile={watchingNow ? undefined : `${layout.tile}px`}
    style:--photo={watchingNow ? undefined : `${layout.photo}px`}
    style:min-height={watchingNow ? undefined : `${layout.minHeight + tileRoom}px`}
  >
    {#each people as person (person.id)}
      <div class="group-call__person">
        <span
          class="group-call__avatar"
          class:group-call__avatar--speaking={person.speaking && !person.muted}
          class:group-call__avatar--ringing={person.ringing}
          class:group-call__avatar--camera={!!person.camera}
        >
          {#if person.self || person.ringing || !call}
            <CallTile user={person.user} stream={person.camera} />
          {:else}
            <button
              class="group-call__adjust"
              aria-haspopup="dialog"
              aria-label={person.live
                ? t("screen.watch", { name: person.user.username })
                : t("call.userVolume", { name: person.user.username })}
              data-tooltip={person.live ? t("screen.watch", { name: person.user.username }) : undefined}
              class:group-call__adjust--live={person.live}
              onclick={() => person.live && groupCall.watch(person.id)}
              oncontextmenu={(event) => openMenu(event, person.user)}
              onkeydown={(event) => menuKey(event, person.user)}
            >
              <CallTile user={person.user} stream={person.camera} />
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
          {#if person.cameraOn}
            <span
              class="group-call__badge group-call__badge--camera"
              role="img"
              aria-label={t("call.peerCamera", { name: person.user.username })}
            >
              <CallIcon name="camera" />
            </span>
          {/if}
          {#if person.live}
            <span class="group-call__live">{t("screen.live")}</span>
          {/if}
        </span>
      </div>
    {/each}
  </div>
  {#if previewCount > 0}
    <div class="group-call__previews">
      {#if groupCall.sharing && chat.user}
        <ScreenPreview
          image={groupCall.ownPreview}
          name={chat.user.username}
          width={previewWidth(previewCount)}
          viewers={groupCall.viewers.map((id) => chat.nameOf(id))}
          own
        />
      {/if}
      {#each sharers as sharer (sharer.id)}
        <ScreenPreview
          image={(call ? groupCall.previews : groupCall.outsidePreviews[group.id])?.[sharer.id] ?? null}
          name={sharer.user.username}
          width={previewWidth(previewCount)}
          disabled={groupCall.joining}
          onwatch={() => watchSharer(sharer.id)}
        />
      {/each}
    </div>
  {/if}
  {#if call}
    <span class="group-call__status" aria-live="polite">
      {elapsed.format(startedAt ?? call.startedAt)}
      <CallSecurity
        peers={people
          .filter(({ self, ringing }) => !self && !ringing)
          .map(({ id, user }) => ({ id, name: user.username }))}
      />
    </span>
  {/if}
  {#if !call}
    <div class="group-call__controls">
      {#if ringing}
        <button
          class="group-call__button group-call__button--leave"
          aria-label={t("call.decline")}
          data-tooltip={t("call.decline")}
          onclick={() => groupCall.decline()}
        >
          <CallIcon name="hangUp" />
        </button>
        {#if !ringing.hidden && preferences.values.callSounds}
          <button
            class="group-call__button"
            aria-label={t("call.hide")}
            data-tooltip={t("call.hide")}
            onclick={() => groupCall.hide()}
          >
            <CallIcon name="dash" />
          </button>
        {/if}
      {/if}
      <button
        class="group-call__button group-call__button--join"
        aria-label={t("group.joinCallShort")}
        data-tooltip={t("group.joinCallShort")}
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
        data-tooltip={groupCall.muted ? t("call.unmute") : t("call.mute")}
        aria-pressed={groupCall.muted}
        onclick={() => groupCall.toggleMute()}
      >
        <CallIcon name={groupCall.muted ? "micOff" : "mic"} />
      </button>
      <button
        class="group-call__button"
        class:group-call__button--off={groupCall.deafened}
        aria-label={groupCall.deafened ? t("call.undeafen") : t("call.deafen")}
        data-tooltip={groupCall.deafened ? t("call.undeafen") : t("call.deafen")}
        aria-pressed={groupCall.deafened}
        onclick={() => groupCall.toggleDeafen()}
      >
        <CallIcon name={groupCall.deafened ? "headphonesOff" : "headphones"} />
      </button>
      <button
        class="group-call__button"
        class:group-call__button--off={!!groupCall.camera}
        aria-label={groupCall.camera ? t("call.cameraOff") : t("call.cameraOn")}
        data-tooltip={groupCall.camera ? t("call.cameraOff") : t("call.cameraOn")}
        aria-pressed={!!groupCall.camera}
        onclick={() => groupCall.toggleCamera()}
      >
        <CallIcon name="camera" />
      </button>
      <span class="group-call__share">
        <button
          class="group-call__button"
          class:group-call__button--off={groupCall.sharing}
          aria-label={groupCall.sharing ? t("screen.options") : t("screen.share")}
          data-tooltip={groupCall.sharing ? t("screen.options") : t("screen.share")}
          aria-pressed={groupCall.sharing}
          onclick={() => (picking = !picking)}
        >
          <CallIcon name="screen" />
        </button>
        {#if picking}
          <ScreenPicker
            current={groupCall.shareSettings}
            onshare={(sourceId, quality) => groupCall.startShare(sourceId, quality)}
            onstop={() => groupCall.stopShare()}
            onclose={() => (picking = false)}
          />
        {/if}
      </span>
      <button
        class="group-call__button group-call__button--leave"
        aria-label={t("group.leaveCall")}
        data-tooltip={t("group.leaveCall")}
        onclick={() => groupCall.leave()}
      >
        <CallIcon name="hangUp" />
      </button>
    </div>
  {/if}
  <ResizeHandle setting={watchingNow ? "watchHeight" : "callHeight"} minimum={watchingNow ? watchMinimum : 180} />
</section>

{#if menu}
  <CallVolumeMenu user={menu.user} x={menu.x} y={menu.y} onclose={() => (menu = null)} />
{/if}

<style>
  .group-call {
    position: relative;
    flex: none;
    justify-content: center;
    padding: 24px var(--page-gutter);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    background: #090909;
    border-bottom: 1px solid var(--border-color);
  }

  .group-call__people {
    align-self: stretch;
    flex: 1 1 0;
    padding: 0 var(--previews-space);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    align-content: center;
    justify-content: center;
    gap: 20px;
    contain: size;
  }

  .group-call__person {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .group-call__avatar {
    --size: var(--photo);
    position: relative;
    width: var(--size);
    height: var(--size);
    flex: none;
    display: flex;
    border-radius: 50%;
    box-shadow:
      0 0 0 3px #090909,
      0 0 0 6px transparent;
    transition:
      box-shadow ease 0.15s,
      border-radius ease 0.25s;
  }

  .group-call__avatar :global(.avatar) {
    border-radius: inherit;
  }

  .group-call__people--squares .group-call__avatar {
    --size: var(--tile);
    border-radius: 14px;
  }

  .group-call__people--morphing .group-call__avatar {
    transition:
      box-shadow ease 0.15s,
      border-radius ease 0.25s,
      width ease 0.25s,
      height ease 0.25s;
  }

  .group-call__avatar--speaking {
    box-shadow:
      0 0 0 3px #090909,
      0 0 0 6px var(--success-color);
  }

  .group-call__people .group-call__avatar--camera {
    --size: var(--tile);
    border-radius: 14px;
  }

  .group-call__adjust {
    width: 100%;
    height: 100%;
    padding: 0;
    display: flex;
    border: 0;
    border-radius: inherit;
    background: transparent;
    cursor: context-menu;
  }

  .group-call__badge {
    position: absolute;
    top: -4px;
    right: -4px;
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

  .group-call__badge--camera {
    left: -4px;
    right: auto;
    color: var(--muted-color);
  }

  .group-call__status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
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

  .group-call__live {
    position: absolute;
    left: 50%;
    bottom: -8px;
    padding: 1px 6px;
    transform: translateX(-50%);
    border-radius: 4px;
    border: 2px solid #090909;
    background: var(--error-color);
    color: #ffffff;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    white-space: nowrap;
    pointer-events: none;
  }

  .group-call__adjust--live {
    cursor: pointer;
  }

  .group-call__previews {
    position: absolute;
    left: var(--page-gutter);
    top: 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .group-call__share {
    position: relative;
    display: flex;
  }

  .group-call--watching {
    padding-top: 16px;
    padding-bottom: 16px;
  }

  .group-call:not(.group-call--watching) {
    min-height: max-content;
  }

  .group-call__stage {
    width: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .group-call--watching .group-call__stage {
    flex: 1 1 auto;
    padding: 0 calc(var(--side) + 16px);
    justify-content: center;
    container-type: size;
  }

  .group-call--watching .group-call__previews {
    top: 16px;
  }

  .group-call--watching .group-call__people {
    position: absolute;
    top: 16px;
    right: var(--page-gutter);
    bottom: 120px;
    width: var(--side);
    padding: 6px 0;
    flex-direction: column;
    flex-wrap: nowrap;
    justify-content: flex-start;
    gap: 18px;
    overflow-y: auto;
  }

  .group-call--watching .group-call__people {
    --photo: 52px;
    --tile: calc(var(--side) - 12px);
  }

  .group-call--watching .group-call__avatar--camera {
    border-radius: 12px;
  }

  .group-call--watching .group-call__people--squares .group-call__avatar {
    border-radius: 12px;
  }
</style>
