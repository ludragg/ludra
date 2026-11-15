import { t, type Key } from "@/i18n";
import { Presence } from "@/protocol/ludra/v1/models_pb";

const keys: Record<Presence, Key> = {
  [Presence.UNSPECIFIED]: "presence.offline",
  [Presence.ONLINE]: "presence.online",
  [Presence.OFFLINE]: "presence.offline",
  [Presence.INVISIBLE]: "presence.invisible",
  [Presence.BUSY]: "presence.busy",
};

export function presenceLabel(presence: Presence): string {
  return t(keys[presence]);
}
