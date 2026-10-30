// One request per short-lived process. No application credentials are inherited.
import sharp from "sharp";
sharp.cache(false);
sharp.concurrency(1);
const chunks = []; let size = 0;
try {
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 50 * 1024 * 1024) throw new Error("size");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const image = sharp(bytes, { failOn: "warning", limitInputPixels: 12000000, animated: false });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new Error("format");
  // Extract pixels, then start a new encoder: original containers, EXIF,
  // profiles, comments and appended data cannot enter the stored file.
  const dimension = process.argv[2] === "avatar" ? 1024 : 2048;
  const { data, info } = await image.rotate().resize({ width: dimension, height: dimension, fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const output = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).webp({ quality: 82 }).toBuffer();
  if (output.length > 3 * 1024 * 1024) throw new Error("size");
  process.stdout.write(output);
} catch { process.exitCode = 1; }
