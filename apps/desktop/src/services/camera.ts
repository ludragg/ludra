import { t } from "@/i18n";

export const cameraCarrier = new MediaStream();

export const cameraEncoding: RTCRtpEncodingParameters = { maxBitrate: 1_500_000, maxFramerate: 30 };

export function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  });
}

export function cameraError(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === "NotAllowedError") {
    return t("call.cameraDenied");
  }
  if (cause instanceof DOMException && cause.name === "NotReadableError") {
    return t("call.cameraBusy");
  }
  return t("call.cameraMissing");
}
