import { Presence } from "@/protocol/ludra/v1/models_pb";

export const presenceLabel: Record<Presence, string> = {
  [Presence.UNSPECIFIED]: "Offline",
  [Presence.ONLINE]: "Online",
  [Presence.OFFLINE]: "Offline",
};
