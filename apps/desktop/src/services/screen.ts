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
  720: 2_500_000,
  1080: 4_500_000,
  1440: 8_000_000,
};

const fpsFactors: Record<FrameRate, number> = {
  30: 1,
  60: 1.5,
  120: 2.2,
};

export function qualityLabel({ resolution, fps }: ScreenQuality): string {
  return `${resolution}p ${fps}`;
}

export async function captureScreen(sourceId: string, quality: ScreenQuality): Promise<NativeScreen> {
  const height = quality.resolution;
  const width = Math.round((height * 16) / 9);
  return NativeScreen.start(sourceId, width, height, quality.fps);
}

const videoCodecs = ["video/VP9", "video/VP8", "video/H264", "video/AV1"];

export function hintScreenTracks(stream: MediaStream) {
  for (const track of stream.getVideoTracks()) {
    track.contentHint = "detail";
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
  const tuning = "x-google-start-bitrate=6000;x-google-min-bitrate=1500;x-google-max-bitrate=30000";
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

export async function applyScreenEncoding(sender: RTCRtpSender, quality: ScreenQuality) {
  const parameters = sender.getParameters();
  parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
  for (const encoding of parameters.encodings) {
    encoding.maxBitrate = Math.round(baseBitrates[quality.resolution] * fpsFactors[quality.fps]);
    encoding.maxFramerate = quality.fps;
  }
  parameters.degradationPreference = "maintain-resolution";
  await sender.setParameters(parameters).catch(() => undefined);
}
