<script lang="ts">
  import { Avatar, GroupAvatar } from "@/components";
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import { t } from "@/i18n";
  import { chat } from "@/stores/chat.svelte";
  import { groupCall, type Ringing } from "@/stores/group-call.svelte";

  let { ringing }: { ringing: Ringing } = $props();

  const group = $derived(chat.conversations.find(({ id }) => id === ringing.conversationId));

  function answer() {
    if (!chat.user) {
      return;
    }
    chat.sidebarTab = "group";
    chat.select(ringing.conversationId).catch(() => undefined);
    groupCall.join(ringing.conversationId, chat.user.id);
  }
</script>

<div class="group-ringing">
  <div class="group-ringing__card" role="alertdialog" aria-label={t("call.incomingDialog")}>
    <span class="group-ringing__avatar">
      {#if group}
        <GroupAvatar id={group.id} avatar={group.avatar} size="ringing" />
      {:else}
        <Avatar user={ringing.starter} size="ringing" />
      {/if}
    </span>
    <div class="group-ringing__text">
      <span class="group-ringing__name">{group?.name ?? ringing.starter.username}</span>
      <span class="group-ringing__hint">{t("group.ringing", { name: ringing.starter.username })}</span>
    </div>
    <div class="group-ringing__actions">
      <button
        class="group-ringing__button group-ringing__button--decline"
        aria-label={t("call.decline")}
        data-tooltip={t("call.decline")}
        onclick={() => groupCall.decline()}
      >
        <CallIcon name="hangUp" />
      </button>
      <button
        class="group-ringing__button group-ringing__button--hide"
        aria-label={t("call.hide")}
        data-tooltip={t("call.hide")}
        onclick={() => groupCall.hide()}
      >
        <CallIcon name="dash" />
      </button>
      <button
        class="group-ringing__button group-ringing__button--answer"
        aria-label={t("group.joinCallShort")}
        data-tooltip={t("group.joinCallShort")}
        onclick={answer}
        {@attach (button) => button.focus()}
      >
        <CallIcon name="phone" />
      </button>
    </div>
  </div>
</div>

<style>
  .group-ringing {
    position: fixed;
    inset: 32px 0 0;
    z-index: 10;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.6);
  }

  .group-ringing__card {
    width: 280px;
    padding: 32px 24px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    border-radius: 12px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
    text-align: center;
  }

  .group-ringing__avatar {
    display: flex;
    border-radius: 50%;
    animation: group-ringing-pulse 1.4s ease-out infinite;
  }

  .group-ringing__text {
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .group-ringing__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 600;
    color: var(--muted-color);
  }

  .group-ringing__hint {
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  .group-ringing__actions {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .group-ringing__button {
    width: 48px;
    height: 48px;
    padding: 14px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    color: #ffffff;
    transition: background ease 0.1s;
  }

  .group-ringing__button--hide {
    background: rgba(255, 255, 255, 0.08);
    color: var(--muted-color);
  }

  .group-ringing__button--hide:hover {
    background: rgba(255, 255, 255, 0.14);
  }

  .group-ringing__button--decline {
    background: var(--error-color);
  }

  .group-ringing__button--decline:hover {
    background: #c8173f;
  }

  .group-ringing__button--answer {
    background: var(--success-color);
  }

  .group-ringing__button--answer:hover {
    background: #178540;
  }

  @keyframes group-ringing-pulse {
    from {
      box-shadow: 0 0 0 0 rgba(28, 151, 73, 0.5);
    }
    to {
      box-shadow: 0 0 0 18px rgba(28, 151, 73, 0);
    }
  }
</style>
