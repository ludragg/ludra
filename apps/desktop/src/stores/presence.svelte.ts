import {
  AWAY_TIMEOUT_MINUTES,
  PRESENCE_STATUSES,
  type PresenceStatus,
  type PresenceStatusSource,
} from "@/constants/presence";
import {
  mockActivityProvider,
  resolveVisibleActivity,
  type ActivityPrivacy,
  type RegisteredGame,
  type UserActivity,
} from "@/services/activity-providers";
import { clonePlain, getSeedProfiles } from "@/services/profile-api";

export interface PresenceRecord {
  status: PresenceStatus;
  statusSource: PresenceStatusSource;
  activity: UserActivity | null;
  privacy: ActivityPrivacy;
  updatedAt: number;
}

type StatusSyncListener = (userId: string, status: PresenceStatus) => void;

const PRESENCE_PREFIX = "ludra:presence:";
const GAMES_PREFIX = "ludra:games:";

function presenceKey(userId: string): string {
  return `${PRESENCE_PREFIX}${userId}`;
}

function gamesKey(userId: string): string {
  return `${GAMES_PREFIX}${userId}`;
}

function normalizePresenceRecord(raw: unknown): PresenceRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Partial<PresenceRecord>;
  const status: PresenceStatus =
    typeof parsed.status === "string" && parsed.status in PRESENCE_STATUSES
      ? (parsed.status as PresenceStatus)
      : "online";
  const statusSource: PresenceStatusSource = parsed.statusSource === "auto" ? "auto" : "manual";
  return {
    status,
    statusSource,
    activity: parsed.activity && typeof parsed.activity === "object" ? parsed.activity : null,
    privacy: {
      showActivity: parsed.privacy?.showActivity ?? true,
      showElapsed: parsed.privacy?.showElapsed ?? true,
    },
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}

function readStoredPresence(userId: string): PresenceRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(presenceKey(userId));
    if (!raw) return null;
    return normalizePresenceRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStoredPresence(userId: string, record: PresenceRecord): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(presenceKey(userId), JSON.stringify(record));
  } catch {
    // Ignora falha de cota no localStorage
  }
}

function readStoredGames(userId: string): RegisteredGame[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(gamesKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RegisteredGame[]) : [];
  } catch {
    return [];
  }
}

function writeStoredGames(userId: string, list: RegisteredGame[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(gamesKey(userId), JSON.stringify(list));
  } catch {
    // Ignora falha de cota
  }
}

function buildInitialPresence(): Record<string, PresenceRecord> {
  const seeds = getSeedProfiles();
  const map: Record<string, PresenceRecord> = {};
  for (const [id, profile] of Object.entries(seeds)) {
    const stored = readStoredPresence(id);
    map[id] = stored ?? {
      status: profile.status,
      statusSource: "manual",
      activity: profile.activity ? clonePlain(profile.activity) : null,
      privacy: clonePlain(profile.activityPrivacy),
      updatedAt: Date.now(),
    };
  }
  return map;
}

function buildInitialGames(): Record<string, RegisteredGame[]> {
  const seeds = getSeedProfiles();
  const map: Record<string, RegisteredGame[]> = {};
  for (const id of Object.keys(seeds)) {
    map[id] = readStoredGames(id);
  }
  return map;
}

/**
 * Store reativo de presença, detecção de jogos e jogos registrados (fonte única de verdade).
 *
 * Persistência local:
 * - `ludra:presence:<userId>` (status, atividade detectada, privacidade global)
 * - `ludra:games:<userId>` (histórico de jogos registrados, compartilhamento por jogo e ignorados)
 *
 * TODO (Backend / Tempo real):
 * - `PUT /users/me/activity` (`{ gameId, startedAt }`)
 * - `DELETE /users/me/activity`
 * - `GET /users/:id/presence`
 * - `GET /games/catalog`
 * - `PATCH /users/me/games/:gameId` (`{ sharing, ignored }`)
 * - `PATCH /users/me/presence` (`{ status, statusSource }`)
 * - Substituir `localStorage` + `storage` por WebSocket / Supabase Realtime com heartbeat a cada 60s.
 */
class PresenceStore {
  records = $state<Record<string, PresenceRecord>>(buildInitialPresence());
  registeredGames = $state<Record<string, RegisteredGame[]>>(buildInitialGames());
  /** Indica se o agente desktop nativo está conectado (false no navegador comum) */
  desktopConnected = $state(false);
  #statusListeners = new Set<StatusSyncListener>();

  constructor() {
    mockActivityProvider.attach((userId, activity) => {
      this.publish(userId, { activity });
    });

    if (typeof window !== "undefined") {
      window.addEventListener("storage", (event) => {
        if (!event.key || !event.newValue) return;
        if (event.key.startsWith(PRESENCE_PREFIX)) {
          const userId = event.key.slice(PRESENCE_PREFIX.length);
          try {
            const parsed = normalizePresenceRecord(JSON.parse(event.newValue));
            if (!parsed) return;
            this.records[userId] = parsed;
            for (const listener of this.#statusListeners) {
              listener(userId, parsed.status);
            }
          } catch {
            // Ignora JSON inválido
          }
        } else if (event.key.startsWith(GAMES_PREFIX)) {
          const userId = event.key.slice(GAMES_PREFIX.length);
          try {
            const parsed = JSON.parse(event.newValue);
            if (Array.isArray(parsed)) {
              this.registeredGames[userId] = parsed as RegisteredGame[];
            }
          } catch {
            // Ignora JSON inválido
          }
        }
      });
    }
  }

  onStatusChanged(listener: StatusSyncListener): () => void {
    this.#statusListeners.add(listener);
    return () => this.#statusListeners.delete(listener);
  }

  /** Registra ou atualiza um jogo no histórico de "Jogos registrados" ao ser detectado */
  #upsertDetectedGame(userId: string, activity: UserActivity) {
    const gameId = activity.gameId || activity.name.toLowerCase().replace(/\s+/g, "-");
    const list = [...(this.registeredGames[userId] ?? [])];
    const idx = list.findIndex((g) => g.gameId === gameId);
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        name: activity.name,
        iconUrl: activity.iconUrl || list[idx].iconUrl,
        lastPlayedAt: activity.startedAt,
      };
    } else {
      list.unshift({
        gameId,
        name: activity.name,
        iconUrl: activity.iconUrl || "",
        custom: false,
        sharing: true,
        ignored: false,
        lastPlayedAt: activity.startedAt,
        totalPlaytimeMs: 0,
      });
    }
    this.registeredGames[userId] = list;
    writeStoredGames(userId, list);
  }

  publish(
    userId: string,
    patch: {
      status?: PresenceStatus;
      statusSource?: PresenceStatusSource;
      activity?: UserActivity | null;
      privacy?: ActivityPrivacy;
    },
  ) {
    const prev = this.records[userId] ?? {
      status: "online" as PresenceStatus,
      statusSource: "manual" as PresenceStatusSource,
      activity: null,
      privacy: { showActivity: true, showElapsed: true },
      updatedAt: Date.now(),
    };

    // Ao encerrar um jogo que estava ativo, acumula o tempo jogado no histórico
    if (patch.activity === null && prev.activity) {
      const prevGameId = prev.activity.gameId || prev.activity.name.toLowerCase().replace(/\s+/g, "-");
      const elapsed = Math.max(0, Date.now() - prev.activity.startedAt);
      const list = [...(this.registeredGames[userId] ?? [])];
      const idx = list.findIndex((g) => g.gameId === prevGameId);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          totalPlaytimeMs: list[idx].totalPlaytimeMs + elapsed,
          lastPlayedAt: Date.now(),
        };
        this.registeredGames[userId] = list;
        writeStoredGames(userId, list);
      }
    }

    if (patch.activity) {
      this.#upsertDetectedGame(userId, patch.activity);
    }

    const next: PresenceRecord = {
      status: patch.status ?? prev.status,
      statusSource: patch.statusSource ?? prev.statusSource,
      activity: patch.activity !== undefined ? (patch.activity ? clonePlain(patch.activity) : null) : prev.activity,
      privacy: patch.privacy ? clonePlain(patch.privacy) : prev.privacy,
      updatedAt: Date.now(),
    };

    this.records[userId] = next;
    writeStoredPresence(userId, next);

    if (patch.status !== undefined) {
      for (const listener of this.#statusListeners) {
        listener(userId, next.status);
      }
    }
  }

  setStatus(userId: string, status: PresenceStatus, source: PresenceStatusSource = "manual") {
    this.publish(userId, { status, statusSource: source });
  }

  setPrivacy(userId: string, patch: Partial<ActivityPrivacy>) {
    const prev = this.getRecord(userId).privacy;
    this.publish(userId, { privacy: { ...prev, ...patch } });
  }

  /**
   * Altera compartilhamento de um jogo específico (`Compartilhando` / `Não compartilhando`).
   * TODO (Backend): Chamar `PATCH /users/me/games/:gameId` com `{ sharing }`.
   */
  setGameSharing(userId: string, gameId: string, sharing: boolean) {
    const list = [...(this.registeredGames[userId] ?? [])];
    const idx = list.findIndex((g) => g.gameId === gameId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], sharing };
      this.registeredGames[userId] = list;
      writeStoredGames(userId, list);
    }
  }

  /**
   * Marca um jogo como ignorado / falso positivo ou remove da lista.
   * TODO (Backend): Chamar `PATCH /users/me/games/:gameId` com `{ ignored: true }`.
   */
  ignoreGame(userId: string, gameId: string) {
    const list = (this.registeredGames[userId] ?? []).filter((g) => g.gameId !== gameId);
    this.registeredGames[userId] = list;
    writeStoredGames(userId, list);

    const rec = this.records[userId];
    if (rec?.activity && (rec.activity.gameId === gameId || rec.activity.name.toLowerCase() === gameId.toLowerCase())) {
      this.publish(userId, { activity: null });
    }
  }

  /** Adiciona um jogo personalizado localmente (sem ícone oficial -> usa fallback) */
  addCustomGame(userId: string, name: string, executable = "") {
    const cleanName = name.trim();
    if (!cleanName) return;
    const gameId = `custom-${Date.now()}`;
    const list: RegisteredGame[] = [
      {
        gameId,
        name: cleanName,
        iconUrl: "",
        executable: executable.trim() || undefined,
        custom: true,
        sharing: true,
        ignored: false,
        lastPlayedAt: Date.now(),
        totalPlaytimeMs: 0,
      },
      ...(this.registeredGames[userId] ?? []),
    ];
    this.registeredGames[userId] = list;
    writeStoredGames(userId, list);
  }

  /** Apaga todo o histórico de jogos registrados do usuário */
  clearGameHistory(userId: string) {
    this.registeredGames[userId] = [];
    writeStoredGames(userId, []);
    this.publish(userId, { activity: null });
  }

  getRegisteredGames(userId: string): RegisteredGame[] {
    return (this.registeredGames[userId] ?? []).filter((g) => !g.ignored);
  }

  getRecord(userId: string): PresenceRecord {
    return (
      this.records[userId] ?? {
        status: "online",
        statusSource: "manual",
        activity: null,
        privacy: { showActivity: true, showElapsed: true },
        updatedAt: 0,
      }
    );
  }

  /**
   * Retorna o jogo detectado atualmente para o PRÓPRIO usuário (usado no card do rodapé da sidebar),
   * junto do estado de compartilhamento efetivo daquele jogo.
   */
  getSelfDetected(userId: string): { activity: UserActivity; gameId: string; sharing: boolean } | null {
    const rec = this.records[userId];
    if (!rec?.activity) return null;
    const gameId = rec.activity.gameId || rec.activity.name.toLowerCase().replace(/\s+/g, "-");
    const entry = (this.registeredGames[userId] ?? []).find((g) => g.gameId === gameId);
    if (entry?.ignored) return null;
    return {
      activity: rec.activity,
      gameId,
      sharing: entry ? entry.sharing : true,
    };
  }

  /**
   * Retorna presença + atividade já filtrada na camada de dados (para outros usuários, ProfileCard, sidebar):
   * - Invisível -> activity = null
   * - Interruptor global desligado -> activity = null
   * - Jogo marcado como "Não compartilhando" ou ignorado -> activity = null
   */
  getVisible(userId: string): { status: PresenceStatus; activity: UserActivity | null; showElapsed: boolean } {
    const rec = this.records[userId];
    if (!rec) {
      return { status: "online", activity: null, showElapsed: true };
    }
    const gameId = rec.activity?.gameId || rec.activity?.name.toLowerCase().replace(/\s+/g, "-") || "";
    const entry = gameId ? (this.registeredGames[userId] ?? []).find((g) => g.gameId === gameId) : undefined;
    const visibleActivity = resolveVisibleActivity(
      rec.status,
      rec.activity,
      rec.privacy,
      entry ? entry.sharing : true,
      entry ? entry.ignored : false,
    );
    return {
      status: rec.status,
      activity: visibleActivity,
      showElapsed: rec.privacy.showElapsed,
    };
  }
}

export const presenceStore = new PresenceStore();

/**
 * Hook reativo `usePresence(userId)` que retorna `{ status, statusSource, activity, showElapsed }`.
 */
export function usePresence(getUserId: () => string | null) {
  return {
    get status(): PresenceStatus {
      const id = getUserId();
      return id ? presenceStore.getVisible(id).status : "online";
    },
    get statusSource(): PresenceStatusSource {
      const id = getUserId();
      return id ? presenceStore.getRecord(id).statusSource : "manual";
    },
    get activity(): UserActivity | null {
      const id = getUserId();
      return id ? presenceStore.getVisible(id).activity : null;
    },
    get showElapsed(): boolean {
      const id = getUserId();
      return id ? presenceStore.getVisible(id).showElapsed : true;
    },
  };
}

/**
 * Ausente automático:
 * - Se o usuário estiver "online" e ficar inativo por `AWAY_TIMEOUT_MINUTES`, muda para "away" (`statusSource: "auto"`).
 * - Ao interagir novamente, volta para "online" SOMENTE se a mudança para ausente foi automática.
 */
export function startAutoAway(getUserId: () => string | null): () => void {
  if (typeof window === "undefined") return () => undefined;

  const timeoutMs = Math.max(1000, AWAY_TIMEOUT_MINUTES * 60 * 1000);
  let lastInteraction = Date.now();
  let timerId: number | undefined;
  let lastThrottle = 0;

  const scheduleCheck = () => {
    window.clearTimeout(timerId);
    const remaining = Math.max(500, timeoutMs - (Date.now() - lastInteraction));
    timerId = window.setTimeout(() => {
      const userId = getUserId();
      if (!userId) return;
      const elapsed = Date.now() - lastInteraction;
      const rec = presenceStore.getRecord(userId);
      if (elapsed >= timeoutMs && rec.status === "online") {
        presenceStore.setStatus(userId, "away", "auto");
      } else {
        scheduleCheck();
      }
    }, remaining);
  };

  const handleInteraction = () => {
    const now = Date.now();
    if (now - lastThrottle < 500) return;
    lastThrottle = now;
    lastInteraction = now;

    const userId = getUserId();
    if (userId) {
      const rec = presenceStore.getRecord(userId);
      if (rec.status === "away" && rec.statusSource === "auto") {
        presenceStore.setStatus(userId, "online", "auto");
      }
    }
    scheduleCheck();
  };

  const handleVisibilityChange = () => {
    const userId = getUserId();
    if (!userId) return;
    if (document.visibilityState === "visible") {
      const rec = presenceStore.getRecord(userId);
      const elapsed = Date.now() - lastInteraction;
      if (elapsed >= timeoutMs && rec.status === "online") {
        presenceStore.setStatus(userId, "away", "auto");
      }
      scheduleCheck();
    }
  };

  const events: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
  for (const ev of events) {
    window.addEventListener(ev, handleInteraction, { passive: true });
  }
  document.addEventListener("visibilitychange", handleVisibilityChange);
  scheduleCheck();

  return () => {
    window.clearTimeout(timerId);
    for (const ev of events) {
      window.removeEventListener(ev, handleInteraction);
    }
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
