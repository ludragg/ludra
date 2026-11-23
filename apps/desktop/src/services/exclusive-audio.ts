let current: HTMLAudioElement | null = null;

export function claimPlayback(audio: HTMLAudioElement | undefined) {
  if (current && current !== audio) {
    current.pause();
  }
  current = audio ?? null;
}
