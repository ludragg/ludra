import catalogData from "@/data/games-catalog.json";

export type ActivityType = "playing" | "listening" | "watching";
export type ActivitySource = "desktop" | "steam" | "mock";

export interface CatalogGame {
  id: string;
  name: string;
  executables: {
    win32: string[];
    darwin: string[];
    linux: string[];
  };
  pathHints?: string[];
  iconUrl: string;
  coverUrl?: string;
  iconSource?: string;
}

export interface RegisteredGame {
  gameId: string;
  name: string;
  iconUrl: string;
  executable?: string;
  custom: boolean;
  sharing: boolean;
  ignored: boolean;
  lastPlayedAt: number;
  totalPlaytimeMs: number;
}

export interface UserActivity {
  gameId?: string;
  type: ActivityType;
  name: string;
  iconUrl?: string;
  coverUrl?: string;
  startedAt: number;
  source: ActivitySource;
}

export interface ActivityPrivacy {
  showActivity: boolean;
  showElapsed: boolean;
}

export interface ActivityProvider {
  readonly id: ActivitySource;
  readonly label: string;
  start(): void;
  stop(): void;
  getCurrentActivity(): Promise<UserActivity | null>;
}

/**
 * Fase 3 (TODO documentado): Ludra Rich Presence SDK
 * API/SDK opcional para jogos e apps enviarem atividade própria (detalhes, estado, tempo, party)
 * diretamente ao Ludra, mesmo sem o jogo constar no catálogo `games.json`.
 */

export const GAME_CATALOG_VERSION: string = catalogData.version;
export const GAME_CATALOG: CatalogGame[] = catalogData.games as CatalogGame[];

export function findCatalogGame(gameIdOrName: string): CatalogGame | undefined {
  const needle = gameIdOrName.trim().toLowerCase();
  return GAME_CATALOG.find((g) => g.id.toLowerCase() === needle || g.name.toLowerCase() === needle);
}

/**
 * Resolve conflito quando o app desktop e a Steam detectam jogos ao mesmo tempo.
 * Prioridade: desktop > Steam.
 */
export function mergeDetectedActivities(
  desktopActivity: UserActivity | null,
  steamActivity: UserActivity | null,
): UserActivity | null {
  if (desktopActivity) {
    return desktopActivity;
  }
  return steamActivity;
}

/**
 * Filtra a atividade na camada de dados:
 * - Se o usuário estiver invisível -> NUNCA expõe a atividade.
 * - Se o interruptor global `showActivity` estiver desligado -> retorna null.
 * - Se o jogo estiver com `sharing === false` ou `ignored === true` -> retorna null.
 */
export function resolveVisibleActivity(
  status: string,
  activity: UserActivity | null | undefined,
  privacy?: ActivityPrivacy,
  gameSharing = true,
  gameIgnored = false,
): UserActivity | null {
  if (!activity || !activity.name) return null;
  if (status === "invisible") return null;
  if (privacy && !privacy.showActivity) return null;
  if (!gameSharing || gameIgnored) return null;
  return activity;
}

export function makeGameCoverSvg(bg1: string, bg2: string, accent: string, tag: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bg1}"/>
          <stop offset="100%" stop-color="${bg2}"/>
        </linearGradient>
      </defs>
      <rect width="112" height="112" rx="20" fill="url(#g)"/>
      <circle cx="92" cy="22" r="28" fill="${accent}" fill-opacity="0.25"/>
      <text x="56" y="66" text-anchor="middle" fill="#ffffff" font-family="system-ui,sans-serif" font-size="30" font-weight="800" letter-spacing="1">${tag}</text>
    </svg>`,
  )}`;
}
