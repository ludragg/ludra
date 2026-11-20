<script lang="ts">
  import { tick } from "svelte";
  import StatusDot from "@/components/profile/status-dot.svelte";
  import { PRESENCE_ORDER, PRESENCE_STATUSES, toProtoPresence, type PresenceStatus } from "@/constants/presence";
  import { t } from "@/i18n";
  import { chat } from "@/stores/chat.svelte";
  import { presenceStore } from "@/stores/presence.svelte";

  let { onclose }: { onclose: () => void } = $props();

  let menuEl = $state<HTMLElement>();

  const userId = $derived(chat.user?.id ?? "local-preview");
  const currentStatus = $derived(presenceStore.getRecord(userId).status);

  $effect(() => {
    void tick().then(() => {
      const activeIdx = Math.max(0, PRESENCE_ORDER.indexOf(currentStatus));
      const buttons = menuEl?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
      buttons?.[activeIdx]?.focus();
    });
  });

  function choose(status: PresenceStatus) {
    // Atualização otimista imediata na fonte única de verdade (presenceStore + localStorage)
    presenceStore.setStatus(userId, status, "manual");
    chat.setPresence(toProtoPresence(status)).catch(() => undefined);
    onclose();
  }

  function onkeydown(event: KeyboardEvent) {
    const buttons = Array.from(menuEl?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    if (buttons.length === 0) return;

    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);

    if (event.key === "Escape") {
      event.preventDefault();
      onclose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(currentIndex + 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttons[(currentIndex - 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      buttons[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      buttons[buttons.length - 1]?.focus();
    }
  }
</script>

<div
  class="sidebar-status-menu"
  bind:this={menuEl}
  role="menu"
  aria-label={t("sidebar.status")}
  tabindex="-1"
  onpointerdown={(e) => e.stopPropagation()}
  {onkeydown}
>
  {#each PRESENCE_ORDER as status (status)}
    {@const info = PRESENCE_STATUSES[status]}
    {@const checked = status === currentStatus}
    <button
      type="button"
      class="sidebar-status-menu__option"
      class:sidebar-status-menu__option--active={checked}
      role="menuitemradio"
      aria-checked={checked}
      onclick={() => choose(status)}
    >
      <span class="sidebar-status-menu__dot">
        <StatusDot {status} size="small" bordered={false} ringColor="#111118" />
      </span>
      <span class="sidebar-status-menu__text">
        <span class="sidebar-status-menu__label">{info.label}</span>
        {#if info.description}
          <span class="sidebar-status-menu__desc">{info.description}</span>
        {/if}
      </span>
      {#if checked}
        <svg
          class="sidebar-status-menu__check"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
      {/if}
    </button>
  {/each}
</div>

<style>
  .sidebar-status-menu {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + 8px);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-radius: 10px;
    background: #111118;
    border: 1px solid rgba(139, 92, 246, 0.35);
    box-shadow:
      0 12px 30px rgba(0, 0, 0, 0.7),
      0 0 18px rgba(139, 92, 246, 0.14);
    z-index: 40;
  }

  .sidebar-status-menu__option {
    width: 100%;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    text-align: left;
    transition: background 150ms ease;
  }

  .sidebar-status-menu__option:hover,
  .sidebar-status-menu__option:focus-visible {
    background: rgba(255, 255, 255, 0.06);
    outline: none;
  }

  .sidebar-status-menu__option--active {
    background: rgba(139, 92, 246, 0.12);
  }

  .sidebar-status-menu__dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }

  .sidebar-status-menu__text {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .sidebar-status-menu__label {
    font-size: 13px;
    font-weight: 700;
    color: #ffffff;
    line-height: 1.25;
  }

  .sidebar-status-menu__desc {
    font-size: 11px;
    color: #9ca3af;
    line-height: 1.25;
  }

  .sidebar-status-menu__check {
    width: 16px;
    height: 16px;
    flex: none;
    color: #8b5cf6;
  }
</style>
