import { spawn } from "node:child_process";
import path from "node:path";
import { prepareReadableUpload, UploadSafetyError } from "./upload-safety";
import { validateUpload } from "./storage";
import { INLINE_MEDIA_MAX_BYTES, PHOTO_OUTPUT_MAX_BYTES } from "@/lib/media-limits";

let processing = false;

/** Photo-only reconstruction; never used to accept raw videos or other files. */
export async function reconstructStatusPhoto(file: File, mode: "avatar" | "message" = "message") {
  if (file.size > INLINE_MEDIA_MAX_BYTES) throw new UploadSafetyError(413, "Photos must be 10 MB or smaller.");
  const check = validateUpload(file.name, file.type, file.size, mode);
  const mime = file.type.split(";")[0].trim().toLowerCase();
  if (!check.ok || check.kind !== "image" || !["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new UploadSafetyError(422, "Choose a JPG, PNG, or WebP photo.");
  if (processing) throw new UploadSafetyError(429, "Another photo is processing. Try again in a moment.");
  processing = true;
  let closed: Promise<void> = Promise.resolve();
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const jpeg = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp = bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
    if (bytes.length !== file.size || !(mime === "image/jpeg" ? jpeg : mime === "image/png" ? png : webp)) throw new UploadSafetyError(422, "Photo contents do not match its type.");
    const script = path.resolve("scripts/reconstruct-status-photo.mjs");
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn(process.execPath, ["--max-old-space-size=64", "--disable-proto=throw", "--permission", "--allow-addons", `--allow-fs-read=${script}`, `--allow-fs-read=${path.resolve("node_modules")}`, script, mode], {
        windowsHide: true, stdio: ["pipe", "pipe", "ignore"],
        env: { NODE_ENV: "production", ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) },
      });
      closed = new Promise(done => child.once("close", () => done()));
      const chunks: Buffer[] = []; let total = 0; let settled = false;
      const timer = setTimeout(() => finish(new UploadSafetyError(503, "Photo processing timed out. Try a smaller photo.")), 10000);
      function finish(error?: Error) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (error) { child.kill(); reject(error); }
        else resolve(Buffer.concat(chunks));
      }
      child.on("error", () => finish(new UploadSafetyError(503, "Photo processing is unavailable.")));
      child.stdin.on("error", () => finish(new UploadSafetyError(422, "That photo cannot be safely processed.")));
      child.stdout.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > PHOTO_OUTPUT_MAX_BYTES) finish(new UploadSafetyError(413, "That photo is too large after processing. Try a smaller image."));
        else chunks.push(chunk);
      });
      child.on("close", code => finish(code === 0 && total > 0 ? undefined : new UploadSafetyError(422, "That photo cannot be safely processed. Use a static JPG, PNG, or WebP up to 12 megapixels.")));
      child.stdin.end(bytes);
    });
    return { buffer, extension: ".webp", mimeType: "image/webp", kind: "image" as const };
  } finally { await closed; processing = false; }
}

/** Keep scanning on scanner-equipped hosts; starter photos use isolated pixel reconstruction. */
export function prepareAvatarPhoto(file: File) {
  return process.env.STARTER_MODE === "1" && !process.env.CLAMAV_HOST
    ? reconstructStatusPhoto(file, "avatar")
    : prepareReadableUpload(file, "avatar");
}
