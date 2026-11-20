import type { ActivityProvider, UserActivity } from "./types";

export interface SteamLinkStatus {
  linked: boolean;
  steamId?: string;
  profilePublic: boolean;
}

/**
 * Provedor de detecção automática via Steam (funciona sem o app desktop).
 *
 * TODO (Backend + Steam OpenID):
 * - Fluxo de vínculo via Steam OpenID em Configurações.
 * - A chave da Steam Web API (`STEAM_API_KEY`) fica SOMENTE no backend (variável de ambiente),
 *   nunca no código do cliente.
 * - Backend consulta `ISteamUser/GetPlayerSummaries/v0002` a cada 30–60s para ler `gameextrainfo` e `gameid`
 *   e publica com `source: "steam"`.
 * - Se o perfil Steam do usuário não estiver público (`communityvisibilitystate !== 3`),
 *   retornar `profilePublic: false` para exibir aviso claro ao usuário.
 * - Se o app desktop e a Steam detectarem o mesmo jogo, manter apenas uma atividade com prioridade para o desktop.
 */
export class SteamProvider implements ActivityProvider {
  readonly id = "steam" as const;
  readonly label = "Steam";

  #running = false;
  #linkStatus: SteamLinkStatus = { linked: false, profilePublic: true };

  get linkStatus(): SteamLinkStatus {
    return this.#linkStatus;
  }

  start(): void {
    this.#running = true;
    // TODO (Backend): Iniciar sincronização periódica com o endpoint de presença Steam
  }

  stop(): void {
    this.#running = false;
  }

  async getCurrentActivity(): Promise<UserActivity | null> {
    if (!this.#running || !this.#linkStatus.linked || !this.#linkStatus.profilePublic) {
      return null;
    }
    // TODO (Backend): Retornar atividade obtida da Steam Web API (GetPlayerSummaries)
    return null;
  }
}
