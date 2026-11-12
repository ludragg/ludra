<script lang="ts">
  import Avatar from "@/components/avatar/avatar.svelte";
  import Status from "@/components/status/status.svelte";
  import { chat } from "@/stores/chat.svelte";
</script>

{#if chat.user}
  <div class="sidebar-profile">
    <Avatar id={chat.user.id} name={chat.user.username} />
    <span class="sidebar-profile__info">
      <span class="sidebar-profile__name">{chat.user.username}</span>
      <Status presence={chat.user.presence} />
    </span>
    <button class="sidebar-profile__logout" aria-label="Sair" title="Sair" onclick={() => chat.logout()}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
    </button>
  </div>
{/if}

<style>
  .sidebar-profile {
    margin: 0 16px 16px;
    padding: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 4px;
    background: var(--surface-color);
  }

  .sidebar-profile__info {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  .sidebar-profile__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .sidebar-profile__logout {
    width: 32px;
    height: 32px;
    flex: none;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--subtle-color);
    transition: all ease 0.1s;
  }

  .sidebar-profile__logout:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .sidebar-profile__logout svg {
    width: 16px;
  }
</style>
