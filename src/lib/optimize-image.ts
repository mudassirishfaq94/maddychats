import "client-only";

const MAX_EDGE = 1920;
const REENCODE_THRESHOLD = 900 * 1024;
const OPTIMIZABLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Downscale large still photos and encode them as WebP before E2EE encryption.
 * Animated images, unsupported formats, small images, and browsers without a
 * safe decoder/encoder keep the original bytes.
 */
export async function optimizeImageForUpload(file: File): Promise<File> {
  if (!OPTIMIZABLE_TYPES.has(file.type)) return file;
  if (file.size < REENCODE_THRESHOLD) return file;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    if (longestEdge <= MAX_EDGE && file.size < 2 * 1024 * 1024) return file;

    const scale = Math.min(1, MAX_EDGE / longestEdge);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    let result: Blob | null;
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, width, height);
      result = await canvas.convertToBlob({ type: "image/webp", quality: 0.84 });
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, width, height);
      result = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.84));
    }
    if (!result || result.type !== "image/webp" || result.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([result], `${baseName}.webp`, { type: "image/webp", lastModified: file.lastModified });
  } catch {
    // Compression is optional; unsupported devices still send the original,
    // E2EE-protected file under the existing upload limits.
    return file;
  } finally {
    bitmap?.close();
  }
}
