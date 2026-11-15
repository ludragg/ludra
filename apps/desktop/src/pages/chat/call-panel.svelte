<script lang="ts">
  import { onDestroy } from "svelte";
  import { Avatar } from "@/components";
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import { Elapsed } from "@/helpers/duration.svelte";
  import { t } from "@/i18n";
  import { calls, type Current } from "@/stores/call.svelte";
  import type { User } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";
  import { preferences } from "@/stores/preferences.svelte";
  import CallVolumeMenu from "./call-volume-menu.svelte";

  let { call }: { call: Current } = $props();

  let menu = $state<{ user: User; x: number; y: number } | null>(null);

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

  const elapsed = new Elapsed();
  onDestroy(() => elapsed.stop());

  const status = $derived(
    call.status === "outgoing"
      ? t("call.calling")
      : call.startedAt
        ? elapsed.format(call.startedAt)
        : t("call.connecting"),
  );
</script>

{#snippet person(
  user: User,
  speaking: boolean,
  muted: boolean,
  deafened: boolean,
  adjustable: boolean,
  ringing = false,
)}
  <span
    class="call-panel__person"
    class:call-panel__person--speaking={speaking && !muted}
    class:call-panel__person--ringing={ringing}
  >
    {#if adjustable}
      <button
        class="call-panel__adjust"
        aria-haspopup="dialog"
        aria-label={t("call.userVolume", { name: user.username })}
        oncontextmenu={(event) => openMenu(event, user)}
        onkeydown={(event) => menuKey(event, user)}
      >
        <Avatar {user} size="call" />
      </button>
    {:else}
      <Avatar {user} size="call" />
    {/if}
    {#if deafened || muted}
      <span
        class="call-panel__badge"
        role="img"
        aria-label={deafened
          ? t("call.peerDeafened", { name: user.username })
          : t("call.peerMuted", { name: user.username })}
      >
        <CallIcon name={deafened ? "headphonesOff" : "micOff"} />
      </span>
    {/if}
  </span>
{/snippet}

{#if chat.user}
  <section class="call-panel" aria-label={t("call.panel")}>
    {#if call.status === "incoming"}
      <div class="call-panel__people">
        {@render person(call.peer, false, false, false, false)}
      </div>
      <div class="call-panel__controls">
        <button
          class="call-panel__button call-panel__button--hang-up"
          aria-label={t("call.decline")}
          title={t("call.decline")}
          onclick={() => calls.decline()}
        >
          <CallIcon name="hangUp" />
        </button>
        {#if !call.quiet && !call.hidden && preferences.values.callSounds}
          <button
            class="call-panel__button"
            aria-label={t("call.hide")}
            title={t("call.hide")}
            onclick={() => calls.hide()}
          >
            <CallIcon name="dash" />
          </button>
        {/if}
        <button
          class="call-panel__button call-panel__button--join"
          aria-label={t("call.answer")}
          title={t("call.answer")}
          onclick={() => calls.answer()}
        >
          <CallIcon name="phone" />
        </button>
      </div>
    {:else}
      <div class="call-panel__people">
        {@render person(chat.user, calls.selfSpeaking, calls.muted, calls.deafened, false)}
        {@render person(
          call.peer,
          calls.peerSpeaking,
          calls.peerMuted,
          calls.peerDeafened,
          call.status !== "outgoing",
          call.status === "outgoing",
        )}
      </div>
      <span class="call-panel__status" aria-live="polite">{status}</span>
      <div class="call-panel__controls">
        <button
          class="call-panel__button"
          class:call-panel__button--off={calls.muted}
          aria-label={calls.muted ? t("call.unmute") : t("call.mute")}
          title={calls.muted ? t("call.unmute") : t("call.mute")}
          aria-pressed={calls.muted}
          onclick={() => calls.toggleMute()}
        >
          <CallIcon name={calls.muted ? "micOff" : "mic"} />
        </button>
        <button
          class="call-panel__button"
          class:call-panel__button--off={calls.deafened}
          aria-label={calls.deafened ? t("call.undeafen") : t("call.deafen")}
          title={calls.deafened ? t("call.undeafen") : t("call.deafen")}
          aria-pressed={calls.deafened}
          onclick={() => calls.toggleDeafen()}
        >
          <CallIcon name={calls.deafened ? "headphonesOff" : "headphones"} />
        </button>
        <button
          class="call-panel__button call-panel__button--hang-up"
          aria-label={t("call.hangUp")}
          title={t("call.hangUp")}
          onclick={() => calls.hangUp()}
        >
          <CallIcon name="hangUp" />
        </button>
      </div>
    {/if}
  </section>
{/if}

{#if menu}
  <CallVolumeMenu user={menu.user} x={menu.x} y={menu.y} onclose={() => (menu = null)} />
{/if}

<style>
  .call-panel {
    padding: 28px var(--page-gutter) 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    background: #090909;
    border-bottom: 1px solid var(--border-color);
  }

  .call-panel__people {
    display: flex;
    align-items: center;
    gap: 32px;
  }

  .call-panel__person {
    position: relative;
    display: flex;
    border-radius: 50%;
    box-shadow:
      0 0 0 3px #090909,
      0 0 0 6px transparent;
    transition: box-shadow ease 0.15s;
  }

  .call-panel__person--speaking {
    box-shadow:
      0 0 0 3px #090909,
      0 0 0 6px var(--success-color);
  }

  .call-panel__adjust {
    padding: 0;
    display: flex;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: context-menu;
  }

  .call-panel__badge {
    position: absolute;
    right: -4px;
    bottom: -4px;
    width: 28px;
    height: 28px;
    padding: 6px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--dark-background-color);
    border: 2px solid #090909;
    color: #f6746b;
  }

  .call-panel__status {
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
    font-variant-numeric: tabular-nums;
  }

  .call-panel__controls {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .call-panel__button {
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

  .call-panel__button:hover {
    background: rgba(255, 255, 255, 0.14);
  }

  .call-panel__button--off,
  .call-panel__button--off:hover {
    background: var(--muted-color);
    color: var(--dark-background-color);
  }

  .call-panel__button--hang-up,
  .call-panel__button--hang-up:hover {
    background: var(--error-color);
    color: #ffffff;
  }

  .call-panel__button--hang-up:hover {
    background: #c8173f;
  }

  .call-panel__button--join,
  .call-panel__button--join:hover {
    background: var(--success-color);
    color: #ffffff;
  }

  .call-panel__button--join:hover {
    background: #178540;
  }

  .call-panel__person--ringing {
    animation: call-panel__person-ringing 1.4s ease-out infinite;
  }

  .call-panel__person--ringing :global(.avatar) {
    filter: saturate(0.2) brightness(0.75);
  }

  @keyframes call-panel__person-ringing {
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
