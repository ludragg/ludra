export function composeScreen(native: MediaStream | null, legacy: MediaStream | null, audio: MediaStream | null) {
  if (!native) {
    return legacy;
  }
  const sound = (legacy ?? audio)?.getAudioTracks() ?? [];
  return new MediaStream([...native.getVideoTracks(), ...sound]);
}
