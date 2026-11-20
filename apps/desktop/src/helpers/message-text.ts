import { t } from "@/i18n";
import { MessageKind, type Message } from "@/protocol/ludra/v1/models_pb";

export function messageText(message: Message): string {
  if (message.kind === MessageKind.IMAGE) {
    return t("chat.photo");
  }
  if (message.kind === MessageKind.FILE) {
    return t("chat.file");
  }
  return message.content;
}
