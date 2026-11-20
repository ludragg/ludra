import { Presence } from "@/protocol/ludra/v1/models_pb";

/**
 * Fonte única de verdade para status de presença do Ludra.
 * Todos os componentes (menu, StatusDot, ProfileCard, sidebar, lista de membros e editor)
 * devem importar rótulos, cores e descrições daqui.
 */
export const PRESENCE_STATUSES = {
  online: {
    label: "Online",
    color: "#22c55e",
    description: "",
  },
  away: {
    label: "Ausente",
    color: "#eab308",
    description: "Você aparece como ausente",
  },
  busy: {
    label: "Ocupado",
    color: "#ef4444",
    description: "Você não receberá notificações",
  },
  invisible: {
    label: "Invisível",
    color: "#6b7280",
    description: "Você aparece offline, mas continua com acesso a tudo",
  },
} as const;

export type PresenceStatus = keyof typeof PRESENCE_STATUSES;
export type PresenceStatusSource = "manual" | "auto";

/** Ordem oficial exibida no menu e no editor */
export const PRESENCE_ORDER: readonly PresenceStatus[] = ["online", "away", "busy", "invisible"];

/** Tempo de inatividade em minutos para mudar automaticamente de "online" para "away" */
export const AWAY_TIMEOUT_MINUTES = 10;

export function toProtoPresence(status: PresenceStatus): Presence {
  switch (status) {
    case "online":
    case "away":
      return Presence.ONLINE;
    case "busy":
      return Presence.BUSY;
    case "invisible":
      return Presence.INVISIBLE;
  }
}

export function fromProtoPresence(presence: Presence): PresenceStatus {
  switch (presence) {
    case Presence.BUSY:
      return "busy";
    case Presence.INVISIBLE:
    case Presence.OFFLINE:
    case Presence.UNSPECIFIED:
      return "invisible";
    default:
      return "online";
  }
}
