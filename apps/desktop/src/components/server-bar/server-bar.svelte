<script lang="ts">
  import { GroupAvatar, Logo } from "@/components";
  import { t } from "@/i18n";
  import GroupDialog from "@/pages/group/group-dialog.svelte";
  import { chat } from "@/stores/chat.svelte";

  let creating = $state(false);

  const home = $derived(chat.activeId === null && chat.view === "friends");

  function open(id: string) {
    chat.sidebarTab = "group";
    chat.select(id).catch(() => undefined);
  }
</script>

<nav class="rail" aria-label={t("rail.groups")}>
  <div class="rail__item">
    <span class="rail__pill" class:rail__pill--active={home}></span>
    <button
      class="rail__button rail__button--home"
      class:rail__button--active={home}
      aria-label={t("sidebar.friends")}
      title={t("sidebar.friends")}
      onclick={() => chat.showFriends()}
    >
      <Logo />
    </button>
  </div>

  <span class="rail__divider" aria-hidden="true"></span>

  {#each chat.groups as group (group.id)}
    {@const active = group.id === chat.activeId}
    {@const unread = chat.unread[group.id] ?? 0}
    <div class="rail__item">
      <span class="rail__pill" class:rail__pill--active={active} class:rail__pill--unread={unread > 0 && !active}
      ></span>
      <button
        class="rail__button"
        class:rail__button--active={active}
        class:rail__button--live={!!group.call}
        aria-label={group.name}
        aria-current={active}
        title={group.name}
        onclick={() => open(group.id)}
      >
        <GroupAvatar id={group.id} avatar={group.avatar} size="fill" />
      </button>
      {#if unread > 0}
        <span class="rail__badge" aria-label={t("sidebar.unread", { count: unread })}>{unread}</span>
      {/if}
    </div>
  {/each}

  <div class="rail__item">
    <button
      class="rail__button rail__button--add"
      aria-label={t("group.create")}
      title={t("group.create")}
      onclick={() => (creating = true)}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  </div>
</nav>

{#if creating}
  <GroupDialog onclose={() => (creating = false)} />
{/if}

<style>
  .rail {
    width: 72px;
    flex: none;
    padding: 12px 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    overflow-y: auto;
    scrollbar-width: none;
    background: var(--rail-color);
  }

  .rail::-webkit-scrollbar {
    display: none;
  }

  .rail__item {
    position: relative;
    width: 100%;
    flex: none;
    display: flex;
    justify-content: center;
  }

  .rail__button {
    width: 48px;
    height: 48px;
    padding: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 0;
    border-radius: 50%;
    background: var(--background-color);
    color: var(--body-color);
    transition:
      border-radius ease 0.15s,
      background ease 0.15s,
      color ease 0.15s;
  }

  .rail__button:hover,
  .rail__button--active {
    border-radius: 16px;
  }

  .rail__button--home:hover,
  .rail__button--home.rail__button--active {
    background: var(--brand-color);
  }

  .rail__button--live {
    box-shadow:
      0 0 0 2px var(--rail-color),
      0 0 0 4px var(--success-color);
  }

  .rail__button--add {
    color: var(--success-color);
  }

  .rail__button--add:hover {
    background: var(--success-color);
    color: #ffffff;
  }

  .rail__button svg {
    width: 22px;
  }

  .rail__divider {
    width: 32px;
    height: 2px;
    flex: none;
    border-radius: 1px;
    background: var(--background-color);
  }

  .rail__pill {
    position: absolute;
    top: 50%;
    left: 0;
    width: 4px;
    height: 0;
    border-radius: 0 4px 4px 0;
    background: #ffffff;
    transform: translateY(-50%);
    transition: height ease 0.15s;
  }

  .rail__item:hover .rail__pill {
    height: 20px;
  }

  .rail__pill--unread {
    height: 8px;
  }

  .rail__item .rail__pill--active,
  .rail__item:hover .rail__pill--active {
    height: 40px;
  }

  .rail__badge {
    position: absolute;
    right: 12px;
    bottom: -4px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px 1px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: var(--error-color);
    box-shadow: 0 0 0 3px var(--rail-color);
    color: #ffffff;
    font-size: var(--tiny-font-size);
    font-weight: 700;
  }
</style>
