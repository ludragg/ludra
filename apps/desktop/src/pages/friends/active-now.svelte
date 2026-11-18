<script lang="ts">
  import { onDestroy } from "svelte";
  import { Avatar, GroupAvatar } from "@/components";
  import { Elapsed } from "@/helpers/duration.svelte";
  import { toDate } from "@/helpers/time";
  import { t } from "@/i18n";
  import type { Conversation, User } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";

  const elapsed = new Elapsed();
  onDestroy(() => elapsed.stop());

  /** Grupos com uma chamada acontecendo agora. */
  const live = $derived(chat.groups.filter(({ call }) => call && call.participantIds.length > 0));

  function participants(group: Conversation): User[] {
    const ids = group.call?.participantIds ?? [];
    return ids.flatMap((id) => group.members.find((member) => member.id === id) ?? []);
  }

  function open(group: Conversation) {
    chat.sidebarTab = "group";
    chat.select(group.id).catch(() => undefined);
  }
</script>

<aside class="active" aria-labelledby="active-title">
  <header class="active__header">
    <h2 id="active-title" class="active__title">{t("active.title")}</h2>
  </header>

  {#if live.length > 0}
    <ul class="active__list">
      {#each live as group (group.id)}
        {@const people = participants(group)}
        {@const since = toDate(group.call!.startedAt!).getTime()}
        <li>
          <button
            class="active__card"
            aria-label={t("active.openGroup", { name: group.name })}
            onclick={() => open(group)}
          >
            <GroupAvatar id={group.id} avatar={group.avatar} />
            <span class="active__body">
              <span class="active__name">{group.name}</span>
              <span class="active__meta">
                <span class="active__time">{elapsed.format(since)}</span>
                <span>{t("active.inCall", { count: group.call!.participantIds.length })}</span>
              </span>
            </span>
            <span class="active__people">
              {#each people.slice(0, 3) as person (person.id)}
                <span class="active__person"><Avatar user={person} size="small" /></span>
              {/each}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="active__empty">
      <p class="active__empty-title">{t("active.emptyTitle")}</p>
      <p class="active__empty-text">{t("active.emptyText")}</p>
    </div>
  {/if}
</aside>

<style>
  .active {
    width: 320px;
    flex: none;
    display: flex;
    flex-direction: column;
    border-left: 1px solid rgba(0, 0, 0, 0.2);
  }

  .active__header {
    height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid rgba(0, 0, 0, 0.2);
  }

  .active__title {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--muted-color);
  }

  .active__list {
    margin: 0;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    list-style: none;
  }

  .active__card {
    width: 100%;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 8px;
    background: var(--sidebar-color);
    text-align: left;
    line-height: 1.3;
    transition: background ease 0.1s;
  }

  .active__card:hover {
    background: #35373c;
  }

  .active__body {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
  }

  .active__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    color: var(--muted-color);
  }

  .active__meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .active__time {
    font-weight: 600;
    color: var(--success-color);
    font-variant-numeric: tabular-nums;
  }

  .active__people {
    flex: none;
    display: flex;
    padding-left: 10px;
  }

  .active__person {
    margin-left: -10px;
    display: flex;
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--sidebar-color);
  }

  .active__empty {
    padding: 28px 24px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .active__empty-title {
    margin: 0;
    font-weight: 600;
    color: var(--muted-color);
  }

  .active__empty-text {
    margin: 0;
    font-size: var(--hint-font-size);
    color: var(--subtle-color);
  }

  @media (max-width: 1100px) {
    .active {
      display: none;
    }
  }
</style>
