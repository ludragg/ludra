import type { ActivityProvider, UserActivity } from "./types";

/**
 * Provedor de detecção automática via App Desktop do Ludra (pasta `desktop/` em Electron).
 *
 * Observação técnica: o navegador não consegue listar processos do computador.
 * O agente desktop roda em segundo plano (bandeja do sistema), consulta os processos a cada 10s,
 * envia `PUT /users/me/activity` (`source: "desktop"`), mantém heartbeat a cada 60s
 * e envia `DELETE /users/me/activity` com tolerância de 15s ao fechar o jogo.
 */
export class DesktopAppProvider implements ActivityProvider {
  readonly id = "desktop" as const;
  readonly label = "App Desktop Ludra";

  #running = false;

  start(): void {
    this.#running = true;
    // TODO (Backend / Realtime): Assinar eventos recebidos via PUT /users/me/activity do agente desktop
  }

  stop(): void {
    this.#running = false;
  }

  async getCurrentActivity(): Promise<UserActivity | null> {
    if (!this.#running) return null;
    // TODO (Backend): Consultar `GET /users/:id/presence` para obter a atividade detectada pelo agente desktop
    return null;
  }
}
