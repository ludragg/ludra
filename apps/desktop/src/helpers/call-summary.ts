import { t } from "@/i18n";
import { CallOutcome, MessageKind, type Message } from "@/protocol/ludra/v1/models_pb";

export function isCall(message: Message): boolean {
  return message.kind === MessageKind.CALL;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) {
    return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  }
  if (minutes > 0) {
    return `${minutes} min ${rest} s`;
  }
  return `${rest} s`;
}

export function callSummary(message: Message, myId: string, peerName: string): string {
  const iCalled = message.senderId === myId;

  switch (message.callOutcome) {
    case CallOutcome.ONGOING:
      return t("chat.callOngoing");
    case CallOutcome.COMPLETED:
      return t("chat.callCompleted", { duration: formatDuration(message.callDuration) });
    case CallOutcome.DECLINED:
      return iCalled ? t("chat.callDeclined", { name: peerName }) : t("chat.callDeclinedByYou");
    default:
      return iCalled ? t("chat.callNotAnswered", { name: peerName }) : t("chat.callMissed", { name: peerName });
  }
}

export function callPreview(message: Message): string {
  switch (message.callOutcome) {
    case CallOutcome.ONGOING:
    case CallOutcome.COMPLETED:
      return t("chat.callPreview");
    case CallOutcome.DECLINED:
      return t("chat.callPreviewDeclined");
    default:
      return t("chat.callPreviewMissed");
  }
}
