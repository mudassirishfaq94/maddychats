import { randomUUID } from "crypto";
import { createReadStream } from "fs";
import { mkdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";

/**
 * Local filesystem media storage (V1).
 *
 * Files live under `server/uploads/{avatars,images,files}` — never inside
 * PostgreSQL, and never served directly from disk: every read goes through
 * the authenticated `/api/media/:id` endpoint.
 */

export const UPLOAD_ROOT = path.join(
  process.cwd(),
  "server",
  "uploads",
);

export type Bucket = "avatars" | "images" | "files" | "statuses";

const BUCKETS: Record<Bucket, string> = {
  avatars: "avatars",
  images: "images",
  files: "files",
  statuses: "statuses",
};

/** Size limits (bytes), configurable via environment. */
function envBytes(name: string, fallbackMb: number): number {
  const raw = Number(process.env[name]);
  const mb = Number.isFinite(raw) && raw > 0 ? raw : fallbackMb;
  return Math.floor(mb * 1024 * 1024);
}

export const LIMITS = {
  get avatar() {
    return envBytes("MAX_AVATAR_MB", 5);
  },
  get image() {
    return envBytes("MAX_IMAGE_MB", 10);
  },
  get file() {
    return envBytes("MAX_FILE_MB", 25);
  },
};

/** Allow-list: MIME type → permitted extensions. Anything else is rejected. */
const IMAGE_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
  "image/heic": [".heic"],
  "image/bmp": [".bmp"],
};

const DOCUMENT_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "text/plain": [".txt", ".log", ".md"],
  "text/csv": [".csv"],
  "text/markdown": [".md"],
  "application/json": [".json"],
  "application/zip": [".zip"],
  "application/x-zip-compressed": [".zip"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
};

/** Extensions that must never be accepted, whatever MIME type is claimed. */
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".scr", ".ps1", ".sh",
  ".bash", ".zsh", ".php", ".phtml", ".jsp", ".asp", ".aspx", ".cgi", ".pl",
  ".py", ".rb", ".jar", ".app", ".deb", ".rpm", ".so", ".dylib", ".bin",
  ".htaccess", ".js", ".mjs", ".cjs", ".html", ".htm", ".svg", ".xhtml",
]);

export interface ValidationOk {
  ok: true;
  kind: "image" | "video" | "file";
  extension: string;
  safeName: string;
}
export interface ValidationErr {
  ok: false;
  error: string;
}

/** Strips any directory component and control characters from a filename. */
export function sanitizeName(raw: string): string {
  const base = path.basename(raw.replace(/\\/g, "/"));
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const safe = cleaned.replace(/^\.+/, "").slice(0, 120);
  return safe.length > 0 ? safe : "file";
}

/**
 * Validates a candidate upload. The original filename is used ONLY for
 * display and extension checking — never to build a path.
 */
export function validateUpload(
  originalName: string,
  mimeType: string,
  size: number,
  mode: "avatar" | "message",
): ValidationOk | ValidationErr {
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: "That file is empty." };
  }

  const safeName = sanitizeName(originalName);
  const extension = path.extname(safeName).toLowerCase();

  if (!extension) {
    return { ok: false, error: "Files must have a valid extension." };
  }
  if (BLOCKED_EXTENSIONS.has(extension)) {
    return { ok: false, error: "That file type is not allowed." };
  }
  if (/\.[a-z0-9]+\.[a-z0-9]+$/i.test(safeName)) {
    // double extensions like "invoice.pdf.exe" — only block when the inner
    // part looks executable
    const inner = path.extname(path.basename(safeName, extension)).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(inner)) {
      return { ok: false, error: "That file type is not allowed." };
    }
  }

  const type = mimeType.split(";")[0].trim().toLowerCase();
  const isImage = Object.prototype.hasOwnProperty.call(IMAGE_TYPES, type);
  const isDoc = Object.prototype.hasOwnProperty.call(DOCUMENT_TYPES, type);
  const isVideo = type.startsWith("video/");

  if (mode === "avatar") {
    if (!isImage) {
      return { ok: false, error: "Avatars must be an image (JPG, PNG, WEBP…)." };
    }
    if (!IMAGE_TYPES[type].includes(extension)) {
      return { ok: false, error: "File extension does not match its content type." };
    }
    if (size > LIMITS.avatar) {
      return {
        ok: false,
        error: `Avatars must be ${Math.round(LIMITS.avatar / 1024 / 1024)} MB or smaller.`,
      };
    }
    return { ok: true, kind: "image", extension, safeName };
  }

  if (!isImage && !isDoc) {
    return { ok: false, error: "That file type is not supported." };
  }
  const allowed = isImage ? IMAGE_TYPES[type] : DOCUMENT_TYPES[type];
  if (!allowed.includes(extension)) {
    return { ok: false, error: "File extension does not match its content type." };
  }

  const limit = isImage ? LIMITS.image : LIMITS.file;
  if (size > limit) {
    return {
      ok: false,
      error: `That file is too large (max ${Math.round(limit / 1024 / 1024)} MB).`,
    };
  }

  return {
    ok: true,
    kind: isImage ? "image" : isVideo ? "video" : "file",
    extension,
    safeName,
  };
}

/** Generates a collision-free, server-controlled filename. */
export function generateStoredName(extension: string): string {
  return `${Date.now().toString(36)}-${randomUUID()}${extension}`;
}

/** Absolute path for a bucket-relative path, guarded against traversal. */
export function resolveWithinUploads(relativePath: string): string | null {
  const target = path.resolve(UPLOAD_ROOT, relativePath);
  const root = UPLOAD_ROOT.endsWith(path.sep)
    ? UPLOAD_ROOT
    : UPLOAD_ROOT + path.sep;
  if (target !== UPLOAD_ROOT && !target.startsWith(root)) return null;
  return target;
}

export async function ensureBuckets(): Promise<void> {
  await Promise.all(
    Object.values(BUCKETS).map((b) =>
      mkdir(path.join(UPLOAD_ROOT, b), { recursive: true }),
    ),
  );
}

/** Writes bytes to the given bucket. Returns the uploads-relative path. */
export async function saveBuffer(
  bucket: Bucket,
  storedName: string,
  data: Buffer,
): Promise<string> {
  await ensureBuckets();
  const relative = path.posix.join(BUCKETS[bucket], storedName);
  const absolute = resolveWithinUploads(relative);
  if (!absolute) throw new Error("invalid_path");
  await writeFile(absolute, data, { mode: 0o640 });
  return relative;
}

export async function deleteStored(relativePath: string): Promise<void> {
  const absolute = resolveWithinUploads(relativePath);
  if (!absolute) return;
  await unlink(absolute).catch(() => undefined);
}

export async function statStored(relativePath: string) {
  const absolute = resolveWithinUploads(relativePath);
  if (!absolute) return null;
  try {
    return await stat(absolute);
  } catch {
    return null;
  }
}

/** Node stream for serving a stored file through an authenticated route. */
export function streamStored(relativePath: string) {
  const absolute = resolveWithinUploads(relativePath);
  if (!absolute) return null;
  return createReadStream(absolute);
}
