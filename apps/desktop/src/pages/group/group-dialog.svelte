<script lang="ts">
  import { Avatar, Button, TextField } from "@/components";
  import { maxGroupMembers } from "@/helpers/group-summary";
  import { clean } from "@/helpers/text";
  import { t } from "@/i18n";
  import { FriendState, type Conversation } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";

  let { group, onclose }: { group?: Conversation; onclose: () => void } = $props();

  let name = $state("");
  let picked = $state<string[]>([]);
  let pending = $state(false);
  let error = $state("");

  const creating = $derived(!group);
  const slots = $derived(maxGroupMembers - (group ? group.members.length : 1));
  const left = $derived(slots - picked.length);
  const friends = $derived(
    chat.friends
      .filter(({ state, user }) => state === FriendState.ACCEPTED && user)
      .map(({ user }) => user!)
      .filter((user) => !group?.members.some((member) => member.id === user.id)),
  );
  const valid = $derived(picked.length > 0 && (!creating || clean(name).length > 0));

  function toggle(userId: string) {
    if (picked.includes(userId)) {
      picked = picked.filter((id) => id !== userId);
    } else if (left > 0) {
      picked = [...picked, userId];
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!valid || pending) {
      return;
    }
    pending = true;
    error = "";
    try {
      if (group) {
        await chat.addGroupMembers(group.id, picked);
      } else {
        await chat.createGroup(clean(name), picked);
      }
      onclose();
    } catch {
      error = t("group.failed");
    } finally {
      pending = false;
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onclose();
    }
  }

  function onpointerdown(event: PointerEvent) {
    if (event.target === event.currentTarget) {
      onclose();
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="group-dialog" role="presentation" {onpointerdown}>
  <div class="group-dialog__card" role="dialog" aria-modal="true" aria-labelledby="group-dialog-title">
    <form class="group-dialog__form" onsubmit={submit}>
      <div class="group-dialog__heading">
        <h2 id="group-dialog-title" class="group-dialog__title">
          {creating ? t("group.create") : t("group.addPeople")}
        </h2>
        <span class="group-dialog__hint">
          {creating ? t("group.createHint", { count: maxGroupMembers }) : t("group.addHint", { count: left })}
        </span>
      </div>

      {#if creating}
        <TextField
          id="group-name"
          label={t("group.name")}
          placeholder={t("group.name")}
          hideLabel
          focus
          maxlength={50}
          mask="groupName"
          bind:value={name}
        />
      {/if}

      <div class="group-dialog__list">
        {#each friends as friend (friend.id)}
          {@const checked = picked.includes(friend.id)}
          <button
            type="button"
            class="group-dialog__pick"
            role="checkbox"
            aria-checked={checked}
            disabled={!checked && left === 0}
            onclick={() => toggle(friend.id)}
          >
            <Avatar user={friend} size="small" />
            <span class="group-dialog__name">{friend.username}</span>
            <span class="group-dialog__box" class:group-dialog__box--checked={checked}>
              {#if checked}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12l5 5L20 7" />
                </svg>
              {/if}
            </span>
          </button>
        {:else}
          <p class="group-dialog__empty">{t("group.noFriends")}</p>
        {/each}
      </div>

      {#if error}
        <span class="group-dialog__error" role="alert">{error}</span>
      {/if}

      <div class="group-dialog__actions">
        <Button theme="outline" size="small" onclick={onclose}>{t("group.cancel")}</Button>
        <Button type="submit" size="small" disabled={!valid || pending}>
          {creating ? t("group.create") : t("group.add")}
        </Button>
      </div>
    </form>
  </div>
</div>

<style>
  .group-dialog {
    position: fixed;
    inset: 32px 0 0;
    z-index: 10;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.6);
  }

  .group-dialog__card {
    width: 380px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    border-radius: 12px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
  }

  .group-dialog__form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .group-dialog__heading {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .group-dialog__title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 600;
    color: var(--muted-color);
  }

  .group-dialog__hint {
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  .group-dialog__list {
    max-height: 220px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
  }

  .group-dialog__pick {
    width: 100%;
    padding: 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted-color);
    text-align: left;
    transition: background ease 0.1s;
  }

  .group-dialog__pick:hover:not(:disabled) {
    background: var(--hover-color);
  }

  .group-dialog__pick:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .group-dialog__name {
    min-width: 0;
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .group-dialog__box {
    width: 20px;
    height: 20px;
    padding: 3px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: var(--on-brand-color);
  }

  .group-dialog__box--checked {
    border-color: var(--brand-color);
    background: var(--brand-color);
  }

  .group-dialog__empty {
    margin: 0;
    padding: 8px;
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  .group-dialog__error {
    font-size: var(--small-font-size);
    color: #f6746b;
  }

  .group-dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
