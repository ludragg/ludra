<script lang="ts">
  import { Checkbox } from "@/components";
  import GameIcon from "@/components/activity/game-icon.svelte";
  import { formatActivityElapsed } from "@/helpers/activity-timer.svelte";
  import { chat } from "@/stores/chat.svelte";
  import { presenceStore } from "@/stores/presence.svelte";

  const userId = $derived(chat.user?.id ?? "local-preview");
  const record = $derived(presenceStore.getRecord(userId));
  const games = $derived(presenceStore.getRegisteredGames(userId));

  let openMenuFor = $state<string | null>(null);
  let customName = $state("");
  let customExe = $state("");
  let adding = $state(false);
  let confirmingClear = $state(false);

  function formatPlaytime(ms: number): string {
    const mins = Math.floor(ms / 60_000);
    if (mins < 1) return "< 1 min jogado";
    if (mins < 60) return `${mins} min jogados`;
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hours}h ${rem}min jogados` : `${hours}h jogadas`;
  }

  function handleAddCustom(event: SubmitEvent) {
    event.preventDefault();
    if (!customName.trim()) return;
    presenceStore.addCustomGame(userId, customName, customExe);
    customName = "";
    customExe = "";
    adding = false;
  }

  function handleClearHistory() {
    if (!confirmingClear) {
      confirmingClear = true;
      return;
    }
    presenceStore.clearGameHistory(userId);
    confirmingClear = false;
  }
</script>

<div class="settings-games">
  <!-- Aviso caso o app desktop não esteja conectado -->
  {#if !presenceStore.desktopConnected}
    <div class="settings-games__banner">
      <div class="settings-games__banner-text">
        <strong>App desktop do Ludra não detectado</strong>
        <p>
          O navegador não consegue ver os jogos abertos no computador. Para detecção automática em segundo plano, use o
          app desktop do Ludra.
        </p>
      </div>
      <a class="settings-games__download" href="#baixar-ludra-desktop" onclick={(e) => e.preventDefault()}>
        Baixar app do Ludra
      </a>
    </div>
  {/if}

  <!-- Interruptores globais de privacidade -->
  <section class="settings-games__section">
    <h2 class="settings-games__heading">Privacidade da atividade</h2>
    <div class="settings-games__box">
      <Checkbox
        label="Compartilhar minha atividade"
        checked={record.privacy.showActivity}
        onchange={(checked) => presenceStore.setPrivacy(userId, { showActivity: checked })}
      />
      <Checkbox
        label="Mostrar tempo de jogo"
        checked={record.privacy.showElapsed}
        onchange={(checked) => presenceStore.setPrivacy(userId, { showElapsed: checked })}
      />
      {#if record.status === "invisible"}
        <p class="settings-games__note">
          Seu status está como Invisível: sua atividade nunca é exibida para outros usuários.
        </p>
      {/if}
    </div>
  </section>

  <!-- Jogos registrados -->
  <section class="settings-games__section">
    <div class="settings-games__section-head">
      <h2 class="settings-games__heading">Jogos registrados</h2>
      <div class="settings-games__head-actions">
        <button
          type="button"
          class="settings-games__btn settings-games__btn--purple"
          onclick={() => (adding = !adding)}
        >
          {adding ? "Cancelar" : "+ Adicionar jogo"}
        </button>
        {#if games.length > 0}
          <button
            type="button"
            class="settings-games__btn settings-games__btn--ghost"
            onclick={handleClearHistory}
            onblur={() => (confirmingClear = false)}
          >
            {confirmingClear ? "Confirmar limpeza" : "Apagar histórico"}
          </button>
        {/if}
      </div>
    </div>

    {#if adding}
      <form class="settings-games__custom-form" onsubmit={handleAddCustom}>
        <input
          class="settings-games__input"
          type="text"
          maxlength="50"
          placeholder="Nome do jogo (ex.: Meu Jogo Indie)"
          bind:value={customName}
          required
        />
        <input
          class="settings-games__input"
          type="text"
          maxlength="80"
          placeholder="Executável opcional (ex.: meujogo.exe)"
          bind:value={customExe}
        />
        <button type="submit" class="settings-games__btn settings-games__btn--solid">Salvar jogo</button>
      </form>
    {/if}

    {#if games.length === 0}
      <div class="settings-games__empty">
        <p>Nenhum jogo detectado ainda. Abra um jogo com o app do Ludra aberto.</p>
      </div>
    {:else}
      <ul class="settings-games__list">
        {#each games as game (game.gameId)}
          <li class="settings-games__item">
            <GameIcon src={game.iconUrl} name={game.name} size={40} radius={10} />
            <div class="settings-games__item-info">
              <div class="settings-games__item-title">
                <strong>{game.name}</strong>
                {#if game.custom}
                  <span class="settings-games__custom-badge">Personalizado</span>
                {/if}
              </div>
              <span class="settings-games__item-meta">
                Última vez jogado: {formatActivityElapsed(game.lastPlayedAt)}
                {#if record.privacy.showElapsed && game.totalPlaytimeMs > 0}
                  · {formatPlaytime(game.totalPlaytimeMs)}
                {/if}
              </span>
            </div>

            <div class="settings-games__item-controls">
              <div class="settings-games__dropdown-wrap">
                <button
                  type="button"
                  class="settings-games__dropdown-btn"
                  aria-haspopup="menu"
                  aria-expanded={openMenuFor === game.gameId}
                  onclick={() => (openMenuFor = openMenuFor === game.gameId ? null : game.gameId)}
                >
                  <span>{game.sharing ? "Compartilhando" : "Não compartilhando"}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {#if openMenuFor === game.gameId}
                  <div class="settings-games__menu" role="menu">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={game.sharing}
                      class="settings-games__menu-item"
                      onclick={() => {
                        presenceStore.setGameSharing(userId, game.gameId, true);
                        openMenuFor = null;
                      }}
                    >
                      Compartilhando
                    </button>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={!game.sharing}
                      class="settings-games__menu-item"
                      onclick={() => {
                        presenceStore.setGameSharing(userId, game.gameId, false);
                        openMenuFor = null;
                      }}
                    >
                      Não compartilhando
                    </button>
                  </div>
                {/if}
              </div>

              <button
                type="button"
                class="settings-games__remove"
                title="Ignorar / Remover jogo"
                aria-label="Ignorar ou remover {game.name}"
                onclick={() => presenceStore.ignoreGame(userId, game.gameId)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .settings-games {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .settings-games__banner {
    padding: 14px 16px;
    border-radius: 12px;
    background: rgba(139, 92, 246, 0.12);
    border: 1px solid rgba(139, 92, 246, 0.4);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .settings-games__banner-text strong {
    display: block;
    font-size: 14px;
    color: #ffffff;
  }

  .settings-games__banner-text p {
    margin: 4px 0 0;
    font-size: 12px;
    color: #d1d5db;
    max-width: 480px;
  }

  .settings-games__download {
    height: 36px;
    padding: 0 14px;
    border-radius: 8px;
    background: #8b5cf6;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    flex: none;
  }

  .settings-games__download:hover {
    background: #7c3aed;
  }

  .settings-games__section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .settings-games__section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .settings-games__heading {
    margin: 0;
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 700;
    color: #ffffff;
  }

  .settings-games__head-actions {
    display: flex;
    gap: 8px;
  }

  .settings-games__box {
    padding: 14px;
    border-radius: 12px;
    background: #111118;
    border: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .settings-games__note {
    margin: 0;
    font-size: 12px;
    color: #a78bfa;
  }

  .settings-games__custom-form {
    padding: 12px;
    border-radius: 10px;
    background: #111118;
    border: 1px solid rgba(139, 92, 246, 0.35);
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .settings-games__input {
    flex: 1 1 180px;
    height: 34px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: #0b0b0f;
    color: #ffffff;
    font-size: 13px;
    outline: none;
  }

  .settings-games__input:focus {
    border-color: #8b5cf6;
  }

  .settings-games__btn {
    height: 34px;
    padding: 0 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
  }

  .settings-games__btn--purple {
    background: #111118;
    border: 1px solid #8b5cf6;
    color: #ffffff;
  }

  .settings-games__btn--purple:hover {
    background: #1a1a26;
    box-shadow: 0 0 12px rgba(139, 92, 246, 0.35);
  }

  .settings-games__btn--solid {
    background: #8b5cf6;
    border: 1px solid #a78bfa;
    color: #ffffff;
  }

  .settings-games__btn--ghost {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #9ca3af;
  }

  .settings-games__btn--ghost:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.05);
  }

  .settings-games__empty {
    padding: 28px 16px;
    border-radius: 12px;
    background: #111118;
    border: 1px dashed rgba(255, 255, 255, 0.1);
    text-align: center;
    color: #9ca3af;
    font-size: 13px;
  }

  .settings-games__empty p {
    margin: 0;
  }

  .settings-games__list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .settings-games__item {
    padding: 10px 12px;
    border-radius: 12px;
    background: #111118;
    border: 1px solid rgba(255, 255, 255, 0.07);
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .settings-games__item-info {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .settings-games__item-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #ffffff;
    font-size: 14px;
  }

  .settings-games__custom-badge {
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(139, 92, 246, 0.2);
    color: #c4b5fd;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .settings-games__item-meta {
    font-size: 12px;
    color: #9ca3af;
  }

  .settings-games__item-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }

  .settings-games__dropdown-wrap {
    position: relative;
  }

  .settings-games__dropdown-btn {
    height: 32px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid rgba(139, 92, 246, 0.4);
    background: rgba(139, 92, 246, 0.12);
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .settings-games__dropdown-btn svg {
    width: 14px;
    height: 14px;
    color: #c4b5fd;
  }

  .settings-games__menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 20;
    min-width: 155px;
    padding: 4px;
    border-radius: 10px;
    background: #181824;
    border: 1px solid rgba(139, 92, 246, 0.4);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .settings-games__menu-item {
    width: 100%;
    padding: 7px 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #e5e7eb;
    font-size: 12px;
    font-weight: 600;
    text-align: left;
  }

  .settings-games__menu-item:hover {
    background: rgba(139, 92, 246, 0.2);
    color: #ffffff;
  }

  .settings-games__remove {
    width: 30px;
    height: 30px;
    padding: 0;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: transparent;
    color: #9ca3af;
    display: grid;
    place-items: center;
  }

  .settings-games__remove:hover {
    background: rgba(239, 68, 68, 0.14);
    border-color: rgba(239, 68, 68, 0.45);
    color: #f87171;
  }

  .settings-games__remove svg {
    width: 14px;
    height: 14px;
  }
</style>
