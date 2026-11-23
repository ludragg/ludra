import { NativeScreen } from "@/services/native-screen";

export const resolutions = [720, 1080, 1440] as const;
export const frameRates = [30, 60, 120] as const;

export type Resolution = (typeof resolutions)[number];
export type FrameRate = (typeof frameRates)[number];

export type ScreenQuality = {
  resolution: Resolution;
  fps: FrameRate;
};

const baseBitrates: Record<Resolution, number> = {
  720: 4_000_000,
  1080: 9_000_000,
  1440: 16_000_000,
};

const fpsFactors: Record<FrameRate, number> = {
  30: 1,
  60: 1.5,
  120: 2,
};

export function qualityLabel({ resolution, fps }: ScreenQuality): string {
  return `${resolution}p${fps}`;
}

export async function captureScreen(sourceId: string, quality: ScreenQuality): Promise<NativeScreen> {
  const height = quality.resolution;
  const width = Math.round((height * 16) / 9);
  return NativeScreen.start(sourceId, width, height, quality.fps);
}

const videoCodecs = ["video/VP9", "video/VP8", "video/H264", "video/AV1"];

function smooth(quality: ScreenQuality): boolean {
  return quality.fps >= 60;
}

export function hintScreenTracks(stream: MediaStream, quality: ScreenQuality) {
  for (const track of stream.getVideoTracks()) {
    track.contentHint = smooth(quality) ? "motion" : "detail";
  }
}

export function preferScreenCodecs(transceiver: RTCRtpTransceiver) {
  const codecs = RTCRtpReceiver.getCapabilities("video")?.codecs ?? [];
  const rank = (mimeType: string) => {
    const index = videoCodecs.indexOf(mimeType);
    return index === -1 ? videoCodecs.length : index;
  };
  const sorted = [...codecs].sort((a, b) => rank(a.mimeType) - rank(b.mimeType));
  try {
    transceiver.setCodecPreferences(sorted);
  } catch {
    return;
  }
}

export function tuneVideoBitrate(sdp: string): string {
  const lines = sdp.split("\r\n");
  const payloads = new Set<string>();
  let video = false;
  for (const line of lines) {
    if (line.startsWith("m=")) {
      video = line.startsWith("m=video");
    } else if (video) {
      const match = /^a=rtpmap:(\d+) (H264|VP8|VP9|AV1)\/90000/.exec(line);
      if (match) {
        payloads.add(match[1]);
      }
    }
  }
  const tuning = "x-google-start-bitrate=4500;x-google-min-bitrate=600;x-google-max-bitrate=40000";
  const tuned = new Set<string>();
  const result = lines.map((line) => {
    const match = /^a=fmtp:(\d+) (.*)$/.exec(line);
    if (match && payloads.has(match[1]) && !match[2].includes("x-google-start-bitrate")) {
      tuned.add(match[1]);
      return `a=fmtp:${match[1]} ${match[2]};${tuning}`;
    }
    return line;
  });
  const output: string[] = [];
  for (const line of result) {
    output.push(line);
    const match = /^a=rtpmap:(\d+) /.exec(line);
    if (match && payloads.has(match[1]) && !tuned.has(match[1])) {
      output.push(`a=fmtp:${match[1]} ${tuning}`);
      tuned.add(match[1]);
    }
  }
  return output.join("\r\n");
}

type CodecEncoding = RTCRtpEncodingParameters & { codec?: RTCRtpCodec };

const hardwareCodecs = ["video/VP9", "video/H264"];
const softwareCodec = "video/VP8";
const failedCodecs = new Set<string>();

export function screenBitrate(quality: ScreenQuality): number {
  return Math.round(baseBitrates[quality.resolution] * fpsFactors[quality.fps]);
}

export async function setScreenBitrate(sender: RTCRtpSender, bitrate: number) {
  const parameters = sender.getParameters();
  if (!parameters.encodings?.length) {
    return;
  }
  for (const encoding of parameters.encodings) {
    encoding.maxBitrate = bitrate;
  }
  await sender.setParameters(parameters).catch(() => undefined);
}

function negotiated(sender: RTCRtpSender, mimeType: string): RTCRtpCodec | null {
  const codecs = sender
    .getParameters()
    .codecs.filter((codec) => codec.mimeType.toLowerCase() === mimeType.toLowerCase());
  const usable = codecs.filter(({ sdpFmtpLine = "" }) =>
    mimeType === "video/H264" ? sdpFmtpLine.includes("packetization-mode=1") : !/profile-id=[12]/.test(sdpFmtpLine),
  );
  return usable[0] ?? null;
}

async function powerEfficient(mimeType: string, quality: ScreenQuality): Promise<boolean> {
  const info = await navigator.mediaCapabilities
    .encodingInfo({
      type: "webrtc",
      video: {
        contentType: mimeType,
        width: Math.round((quality.resolution * 16) / 9),
        height: quality.resolution,
        bitrate: screenBitrate(quality),
        framerate: quality.fps,
      },
    })
    .catch(() => null);
  return !!info?.supported && info.powerEfficient;
}

async function screenCodec(sender: RTCRtpSender, quality: ScreenQuality): Promise<RTCRtpCodec | null> {
  for (const mimeType of hardwareCodecs) {
    const codec = failedCodecs.has(mimeType.toLowerCase()) ? null : negotiated(sender, mimeType);
    if (codec && (await powerEfficient(mimeType, quality))) {
      return codec;
    }
  }
  return negotiated(sender, softwareCodec);
}

async function setCodec(sender: RTCRtpSender, codec: RTCRtpCodec | null) {
  const parameters = sender.getParameters();
  const encodings: CodecEncoding[] = parameters.encodings ?? [];
  if (!encodings.length || encodings.every((encoding) => encoding.codec?.mimeType === codec?.mimeType)) {
    return;
  }
  for (const encoding of encodings) {
    if (codec) {
      encoding.codec = codec;
    } else {
      delete encoding.codec;
    }
  }
  await sender.setParameters(parameters).catch(() => undefined);
}

export async function applyScreenEncoding(
  sender: RTCRtpSender,
  quality: ScreenQuality,
  bitrate = screenBitrate(quality),
) {
  const parameters = sender.getParameters();
  parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
  for (const encoding of parameters.encodings) {
    encoding.maxBitrate = bitrate;
    encoding.maxFramerate = quality.fps;
  }
  parameters.degradationPreference = smooth(quality) ? "maintain-framerate" : "maintain-resolution";
  await sender.setParameters(parameters).catch(() => undefined);
  await setCodec(sender, await screenCodec(sender, quality));
}

export async function verifyScreenEncoder(sender: RTCRtpSender, quality: ScreenQuality) {
  const stats = await sender.getStats().catch(() => null);
  let software = false;
  stats?.forEach((report) => {
    if (report.type === "outbound-rtp" && report.framesEncoded > 0 && report.powerEfficientEncoder === false) {
      software = true;
    }
  });
  const encodings: CodecEncoding[] = sender.getParameters().encodings ?? [];
  const current = encodings[0]?.codec?.mimeType.toLowerCase();
  if (software && current && current !== softwareCodec.toLowerCase()) {
    failedCodecs.add(current);
    await setCodec(sender, await screenCodec(sender, quality));
  }
}
