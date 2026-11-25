import { t } from "@/i18n";
import type { ShareEncoder } from "@/services/screen";
import type { DetectedEncoder } from "@/services/stream-encoders";

const vendorNames = { amf: "AMD AMF", nvenc: "NVIDIA NVENC" };

function nameOf({ id, name }: DetectedEncoder): string {
  if (id !== "windows") {
    return vendorNames[id];
  }
  return /intel/i.test(name) ? t("screen.encoderIntel") : t("screen.encoderWindows");
}

export function encoderOptions(detected: DetectedEncoder[]) {
  const automatic = detected[0] ? nameOf(detected[0]) : t("screen.compatibility");
  const options: { value: ShareEncoder; label: string; display?: string }[] = [
    { value: "auto", label: t("screen.encoderAuto"), display: `${t("screen.encoderAuto")} (${automatic})` },
    ...detected.map((encoder) => ({ value: encoder.id, label: nameOf(encoder) })),
    { value: "compatibility", label: t("screen.compatibility") },
  ];
  return options;
}
