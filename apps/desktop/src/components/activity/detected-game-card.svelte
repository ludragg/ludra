<script lang="ts">
  import { chat } from "@/stores/chat.svelte";
  import { presenceStore } from "@/stores/presence.svelte";
  import GameIcon from "./game-icon.svelte";

  let menuOpen = $state(false);
  let rootEl = $state<HTMLElement>();

  const userId = $derived(chat.user?.id ?? "local-preview");
  const detected = $derived(presenceStore.getSelfDetected(userId));
  const record = $derived(presenceStore.getRecord(userId));

  // Compartilhamento efetivo só está ativo se o jogo E o interruptor global estiverem ligados e não invisível
  const effectivelySharing = $derived(
    Boolean(detected?.sharing && record.privacy.showActivity && record.status !== "invisible"),
  );

  function setSharing(value: boolean) {
    if (!detected) return;
    presenceStore.setGameSharing(userId, detected.gameId, value);
    menuOpen = false;
  }

  function onWindowPointerDown(event: PointerEvent) {
    if (menuOpen && !rootEl?.contains(event.target as Node)) {
      menuOpen = false;
    }
  }

  function onWindowKeydown(event: KeyboardEvent) {
    if (menuOpen && event.key === "Escape") {
      event.preventDefault();
      menuOpen = false;
    }
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeydown} />

{#if detected}
  <div class="detected-card" bind:this={rootEl}>
    <GameIcon
      src={detected.activity.iconUrl || detected.activity.coverUrl || ""}
      name={detected.activity.name}
      size={40}
      radius={10}
    />

    <div class="detected-card__info">
      <strong class="detected-card__name" title={detected.activity.name}>{detected.activity.name}</strong>
      <button
        type="button"
        class="detected-card__toggle"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onclick={() => (menuOpen = !menuOpen)}
      >
        <span>{detected.sharing ? "Compartilhando" : "Não compartilhando"}</span>
        <svg class="detected-card__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>

    <!-- Ícone Gamepad2: destaque roxo quando compartilhando, esmaecido com traço quando não -->
    <button
      type="button"
      class="detected-card__status-icon"
      class:detected-card__status-icon--active={effectivelySharing}
      title={effectivelySharing ? "Compartilhando atividade" : "Atividade oculta"}
      aria-label={effectivelySharing ? "Parar de compartilhar este jogo" : "Compartilhar este jogo"}
      onclick={() => setSharing(!detected.sharing)}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="6" y1="11" x2="10" y2="11" />
        <line x1="8" y1="9" x2="8" y2="13" />
        <line x1="15" y1="12" x2="15.01" y2="12" />
        <line x1="18" y1="10" x2="18.01" y2="10" />
        <path
          d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"
        />
        {#if !effectivelySharing}
          <line x1="3" y1="3" x2="21" y2="21" stroke-width="2.4" />
        {/if}
      </svg>
    </button>

    {#if menuOpen}
      <div class="detected-card__menu" role="menu" aria-label="Compartilhamento do jogo">
        <button
          type="button"
          role="menuitemradio"
          aria-checked={detected.sharing}
          class="detected-card__menu-item"
          class:detected-card__menu-item--active={detected.sharing}
          onclick={() => setSharing(true)}
        >
          <span>Compartilhando</span>
          {#if detected.sharing}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
              <path d="M5 12l5 5L20 7" />
            </svg>
          {/if}
        </button>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={!detected.sharing}
          class="detected-card__menu-item"
          class:detected-card__menu-item--active={!detected.sharing}
          onclick={() => setSharing(false)}
        >
          <span>Não compartilhando</span>
          {#if !detected.sharing}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
              <path d="M5 12l5 5L20 7" />
            </svg>
          {/if}
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .detected-card {
    position: relative;
    padding: 8px 10px;
    border-radius: 12px;
    background: rgba(139, 92, 246, 0.14);
    border: 1px solid rgba(139, 92, 246, 0.38);
    display: flex;
    align-items: center;
    gap: 10px;
    animation: detected-in 150ms ease-out;
  }

  .detected-card__info {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .detected-card__name {
    font-size: 13px;
    font-weight: 700;
    color: #ffffff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detected-card__toggle {
    padding: 0;
    border: 0;
    background: transparent;
    color: #9ca3af;
    font-size: 11px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    width: fit-content;
  }

  .detected-card__toggle:hover {
    color: #e5e7eb;
  }

  .detected-card__chevron {
    width: 12px;
    height: 12px;
  }

  .detected-card__status-icon {
    width: 30px;
    height: 30px;
    padding: 6px;
    flex: none;
    border: 0;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    color: #6b7280;
    display: grid;
    place-items: center;
    transition:
      background 150ms ease,
      color 150ms ease,
      box-shadow 150ms ease;
  }

  .detected-card__status-icon--active {
    background: rgba(139, 92, 246, 0.22);
    color: #a78bfa;
    box-shadow: 0 0 10px rgba(139, 92, 246, 0.28);
  }

  .detected-card__status-icon:hover {
    background: rgba(139, 92, 246, 0.3);
    color: #ffffff;
  }

  .detected-card__status-icon svg {
    width: 18px;
    height: 18px;
  }

  .detected-card__menu {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + 6px);
    z-index: 45;
    padding: 4px;
    border-radius: 10px;
    background: #111118;
    border: 1px solid rgba(139, 92, 246, 0.4);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.75);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .detected-card__menu-item {
    width: 100%;
    padding: 7px 10px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #d1d5db;
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: space-between;
    text-align: left;
  }

  .detected-card__menu-item:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #ffffff;
  }

  .detected-card__menu-item--active {
    background: rgba(139, 92, 246, 0.14);
    color: #ffffff;
  }

  .detected-card__menu-item svg {
    width: 14px;
    height: 14px;
    color: #8b5cf6;
  }

  @keyframes detected-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .detected-card {
      animation: none;
    }
  }
</style>
