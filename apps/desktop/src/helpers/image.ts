const avatarSize = 256;
const maxBytes = 48 * 1024;

export const maxUploadBytes = 5 * 1024 * 1024;
export const avatarTypes = ["image/png", "image/jpeg"];

export async function toAvatar(file: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(avatarSize, avatarSize);
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    avatarSize,
    avatarSize,
  );
  bitmap.close();

  for (let quality = 0.9; quality >= 0.3; quality -= 0.1) {
    const blob = await canvas.convertToBlob({ type: "image/webp", quality });
    if (blob.size <= maxBytes) {
      return new Uint8Array(await blob.arrayBuffer());
    }
  }
  throw new Error("image too large");
}
