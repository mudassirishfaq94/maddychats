import sharp from "sharp";
import { createConnection } from "node:net";
import { LIMITS, validateUpload } from "./storage";

export class UploadSafetyError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** clamd INSTREAM: send bytes, never a caller-provided filesystem path. */
export async function scanUpload(bytes: Buffer): Promise<void> {
  const host = process.env.CLAMAV_HOST;
  if (!host) {
    if (process.env.NODE_ENV === "production") throw new UploadSafetyError(503, "Media scanning is unavailable. Try again later.");
    return;
  }
  // Validate host to prevent SSRF via environment variable manipulation
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || host.includes("..")) {
    throw new UploadSafetyError(503, "Media scanning is unavailable.");
  }
  const port = Number(process.env.CLAMAV_PORT || 3310);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new UploadSafetyError(503, "Media scanning is unavailable.");
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port });
    let result = "";
    const timer = setTimeout(() => finish(new UploadSafetyError(503, "Media scanning timed out.")), 15000);
    let settled = false;
    function finish(error?: Error) {
      if (settled) return;
      settled = true; clearTimeout(timer); socket.destroy();
      if (error) reject(error); else resolve();
    }
    socket.on("error", () => finish(new UploadSafetyError(503, "Media scanning is unavailable.")));
    socket.on("close", () => { if (!settled) finish(new UploadSafetyError(503, "Media scanning did not complete.")); });
    socket.on("data", (chunk: Buffer) => {
      result += chunk.toString("utf8");
      if (result.length > 4096) return finish(new UploadSafetyError(503, "Invalid scanner response."));
      if (!result.includes("\0") && !result.includes("\n")) return;
      const reply = result.split(/[\0\n]/)[0].trim();
      if (reply === "stream: OK") finish();
      else if (reply.endsWith(" FOUND")) finish(new UploadSafetyError(422, "That file failed the safety scan."));
      else finish(new UploadSafetyError(503, "Media scanning did not complete."));
    });
    socket.once("connect", async () => {
      try {
        async function write(data: Buffer) {
          await new Promise<void>((done, fail) => socket.write(data, (error) => error ? fail(error) : done()));
        }
        await write(Buffer.from("zINSTREAM\0"));
        for (let offset = 0; offset < bytes.length && !settled; offset += 65536) {
          const chunk = bytes.subarray(offset, offset + 65536);
          const size = Buffer.alloc(4); size.writeUInt32BE(chunk.length);
          await write(Buffer.concat([size, chunk]));
        }
        if (!settled) await write(Buffer.alloc(4));
      } catch { finish(new UploadSafetyError(503, "Media scanning is unavailable.")); }
    });
  });
}

function imageSignature(bytes: Buffer, mime: string) {
  if (mime === "image/jpeg") return bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/gif") return /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString("ascii"));
  if (mime === "image/webp") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  if (mime === "image/avif") return bytes.subarray(4, 8).toString() === "ftyp" && /avif|avis/.test(bytes.subarray(8, 40).toString("ascii"));
  return false;
}

/** Decode + re-encode removes metadata and trailing payloads; bound pixel work. */
export async function prepareReadableUpload(file: File, mode: "avatar" | "message") {
  const check = validateUpload(file.name, file.type, file.size, mode);
  if (!check.ok) throw new UploadSafetyError(422, check.error);
  const bytes = Buffer.from(await file.arrayBuffer());
  const limit = mode === "avatar" ? LIMITS.avatar : check.kind === "image" ? LIMITS.image : LIMITS.file;
  if (bytes.length !== file.size || bytes.length > limit) throw new UploadSafetyError(413, "That file is too large.");
  const mime = file.type.split(";")[0].trim().toLowerCase();
  if (check.kind === "image") {
    if (!imageSignature(bytes, mime)) throw new UploadSafetyError(422, "Image contents do not match its type. Use JPG, PNG, GIF, WebP, or AVIF.");
    await scanUpload(bytes);
    let buffer: Buffer;
    try {
      buffer = await sharp(bytes, { failOn: "warning", limitInputPixels: 20000000 })
        .rotate().resize({ width: mode === "avatar" ? 1024 : 2048, height: mode === "avatar" ? 1024 : 2048, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 }).toBuffer();
    } catch { throw new UploadSafetyError(422, "That image cannot be safely decoded."); }
    if (buffer.length > limit) throw new UploadSafetyError(413, "That image is too large.");
    await scanUpload(buffer);
    return { ...check, buffer, extension: ".webp", mimeType: "image/webp" };
  }
  // Status video is the only currently supported readable non-image upload.
  const iso = ["video/mp4", "video/quicktime"].includes(mime) && bytes.subarray(4, 8).toString() === "ftyp";
  const webm = mime === "video/webm" && bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
  const avi = mime === "video/x-msvideo" && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "AVI ";
  const ogg = mime === "video/ogg" && bytes.subarray(0, 4).toString() === "OggS";
  if (check.kind !== "video" || !(iso || webm || avi || ogg)) throw new UploadSafetyError(422, "File contents do not match a supported media type.");
  await scanUpload(bytes);
  return { ...check, buffer: bytes, mimeType: mime };
}
