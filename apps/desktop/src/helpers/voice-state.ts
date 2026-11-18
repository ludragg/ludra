export type VoiceState = {
  muted: boolean;
  deafened: boolean;
  sharing: string | null;
  direct?: boolean;
  viewers?: string[];
  camera?: string;
};

export type VoiceMessage =
  ({ kind: "state" } & VoiceState) | { kind: "watch"; watching: boolean } | { kind: "preview"; image: string };

const previewPrefix = "data:image/jpeg;base64,";
const maxPreviewLength = 14_000;
const maxViewers = 16;

export function stateMessage(state: VoiceState): string {
  return JSON.stringify({
    muted: state.muted,
    deafened: state.deafened,
    sharing: !!state.sharing,
    quality: state.sharing,
    direct: state.direct,
    viewers: state.viewers,
    camera: state.camera ?? "",
  });
}

export function watchMessage(watching: boolean): string {
  return JSON.stringify({ watch: watching });
}

export function previewMessage(image: string): string {
  return JSON.stringify({ preview: image });
}

export function validPreview(image: string): boolean {
  return (
    image.length <= maxPreviewLength &&
    image.startsWith(previewPrefix) &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(image.slice(previewPrefix.length))
  );
}

export function parseVoiceMessage(payload: string): VoiceMessage {
  try {
    const data = JSON.parse(payload);
    if (typeof data?.watch === "boolean") {
      return { kind: "watch", watching: data.watch };
    }
    if (typeof data?.preview === "string") {
      return { kind: "preview", image: validPreview(data.preview) ? data.preview : "" };
    }
    const quality = typeof data?.quality === "string" ? data.quality.slice(0, 16) : "";
    return {
      kind: "state",
      muted: data?.muted === true,
      deafened: data?.deafened === true,
      sharing: data?.sharing === true ? quality : null,
      direct: typeof data?.direct === "boolean" ? data.direct : undefined,
      viewers: Array.isArray(data?.viewers)
        ? data.viewers.filter((id: unknown) => typeof id === "string").slice(0, maxViewers)
        : [],
      camera: typeof data?.camera === "string" ? data.camera.slice(0, 64) : "",
    };
  } catch {
    return { kind: "state", muted: false, deafened: false, sharing: null };
  }
}
