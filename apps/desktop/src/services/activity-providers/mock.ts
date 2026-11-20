import { findCatalogGame, GAME_CATALOG, type ActivityProvider, type UserActivity } from "./types";

type PublishFn = (userId: string, activity: UserActivity | null) => void;

/**
 * Provedor mockado de detecção automática de jogos para desenvolvimento sem backend.
 *
 * No console do navegador:
 * - `window.__ludraMock.startGame("bf6")`  → simula detecção de Battlefield 6 (ou qualquer id do catálogo)
 * - `window.__ludraMock.stopGame()`        → simula o fechamento do jogo
 * - `window.__ludraMock.listGames()`       → lista os IDs disponíveis no catálogo
 *
 * Persiste em `ludra:presence:<userId>` e dispara atualização entre abas.
 */
export class MockActivityProvider implements ActivityProvider {
  readonly id = "mock" as const;
  readonly label = "Simulador de Detecção (Dev)";

  #current: UserActivity | null = null;
  #publish: PublishFn | null = null;
  #defaultUserId = "local-preview";

  attach(publish: PublishFn, defaultUserId = "local-preview") {
    this.#publish = publish;
    this.#defaultUserId = defaultUserId;

    if (typeof window !== "undefined" && import.meta.env.DEV) {
      const api = {
        startGame: (gameIdOrName: string, userId = this.#defaultUserId) => this.startGame(gameIdOrName, userId),
        stopGame: (userId = this.#defaultUserId) => this.stopGame(userId),
        listGames: () => GAME_CATALOG.map((g) => ({ id: g.id, name: g.name })),
      };
      (window as unknown as { __ludraMock?: typeof api }).__ludraMock = api;
    }
  }

  start(): void {
    // Aguarda simulação via window.__ludraMock
  }

  stop(): void {
    // Nada para limpar
  }

  async getCurrentActivity(): Promise<UserActivity | null> {
    return this.#current;
  }

  startGame(gameIdOrName: string, userId = this.#defaultUserId): UserActivity {
    const found = findCatalogGame(gameIdOrName);
    const activity: UserActivity = {
      gameId: found?.id ?? gameIdOrName.trim().toLowerCase().replace(/\s+/g, "-"),
      type: "playing",
      name: found?.name ?? gameIdOrName.trim(),
      iconUrl: found?.iconUrl ?? "",
      coverUrl: found?.coverUrl ?? "",
      startedAt: Date.now(),
      source: "mock",
    };
    this.#current = activity;
    this.#publish?.(userId, activity);
    return activity;
  }

  stopGame(userId = this.#defaultUserId): void {
    this.#current = null;
    this.#publish?.(userId, null);
  }
}

export const mockActivityProvider = new MockActivityProvider();
