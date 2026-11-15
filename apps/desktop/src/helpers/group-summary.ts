import { formatDuration } from "@/helpers/call-summary";
import { t } from "@/i18n";
import { CallOutcome, MessageEvent, MessageKind, type Message } from "@/protocol/ludra/v1/models_pb";

export const maxGroupMembers = 10;

type Names = (userId: string) => string;

export function isEvent(message: Message): boolean {
  return message.kind === MessageKind.EVENT;
}

export function eventSummary(message: Message, myId: string, nameOf: Names): string {
  const actor = message.senderId === myId ? t("group.you") : message.senderName || nameOf(message.senderId);
  const target = message.targetId === myId ? t("group.youObject") : message.targetName || nameOf(message.targetId);

  switch (message.event) {
    case MessageEvent.MEMBER_ADDED:
      return t("group.memberAdded", { actor, target });
    case MessageEvent.MEMBER_REMOVED:
      return t("group.memberRemoved", { actor, target });
    case MessageEvent.OWNER_CHANGED:
      return t("group.ownerChanged", { actor, target });
    default:
      return t("group.memberLeft", { actor });
  }
}

export function groupCallSummary(message: Message, myId: string, nameOf: Names): string {
  if (message.callOutcome === CallOutcome.ONGOING) {
    const name = message.senderId === myId ? t("group.you") : message.senderName || nameOf(message.senderId);
    return t("group.callStarted", { name });
  }
  return t("group.callEnded", { duration: formatDuration(message.callDuration) });
}
