import { createClient } from "@supabase/supabase-js";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

const apply = process.argv.includes("--apply");
const verifyOnly = process.argv.includes("--verify");
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

const sourceBucket = process.env.SUPABASE_STORAGE_BUCKET ?? "maddy-media";
const targetBucket = process.env.R2_BUCKET ?? "circlo-media";
const endpoint = process.env.R2_ENDPOINT ?? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const source = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const target = new S3Client({
  region: "auto",
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const prefixes = ["avatars", "images", "files", "statuses"];
const stats = new Map(prefixes.map((prefix) => [prefix, { count: 0, bytes: 0 }]));

async function listFiles(prefix) {
  const files = [];
  async function visit(folder) {
    let offset = 0;
    for (;;) {
      const { data, error } = await source.storage.from(sourceBucket).list(folder, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error("Supabase object listing failed.");
      for (const item of data ?? []) {
        const key = folder ? `${folder}/${item.name}` : item.name;
        if (!item.id && !item.metadata) await visit(key);
        else {
          const size = Number(item.metadata?.size);
          if (!Number.isSafeInteger(size) || size < 0) throw new Error("An object has no valid size; migration stopped before copying.");
          files.push({ key, size });
        }
      }
      if (!data || data.length < 1000) break;
      offset += data.length;
    }
  }
  await visit(prefix);
  return files;
}

async function sourceObject(key) {
  const objectPath = key.split("/").map(encodeURIComponent).join("/");
  const url = new URL(`/storage/v1/object/authenticated/${encodeURIComponent(sourceBucket)}/${objectPath}`, process.env.SUPABASE_URL);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY },
    signal: AbortSignal.timeout(120_000),
    redirect: "error",
  });
  if (!response.ok || !response.body) throw new Error("Supabase object download failed.");
  return response;
}

async function targetSize(key) {
  try {
    const head = await target.send(new HeadObjectCommand({ Bucket: targetBucket, Key: key }));
    return typeof head.ContentLength === "number" ? head.ContentLength : null;
  } catch (error) {
    if (["NotFound", "NoSuchKey"].includes(error?.name) || error?.$metadata?.httpStatusCode === 404) return null;
    throw new Error("Cloudflare R2 object check failed.");
  }
}

try {
for (const prefix of prefixes) {
  const files = await listFiles(prefix);
  let copied = 0;
  for (const file of files) {
    const currentSize = await targetSize(file.key);
    if (currentSize === file.size) continue;
    if (currentSize !== null) throw new Error("R2 already contains an object with a different size; migration stopped without overwriting it.");
    if (!apply && !verifyOnly) continue;
    if (verifyOnly) throw new Error("R2 verification failed: at least one source object is missing or has a different size.");

    const response = await sourceObject(file.key);
    const contentLength = response.headers.get("content-length");
    const responseSize = contentLength === null ? null : Number(contentLength);
    if (responseSize !== null && Number.isSafeInteger(responseSize) && responseSize !== file.size) throw new Error("Source size changed during migration.");
    await target.send(new PutObjectCommand({
      Bucket: targetBucket,
      Key: file.key,
      Body: Readable.fromWeb(response.body),
      ContentLength: file.size,
      ContentType: "application/octet-stream",
    }));
    if (await targetSize(file.key) !== file.size) throw new Error("R2 verification failed after copying an object.");
    copied++;
  }
  stats.set(prefix, { count: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0), copied });
}

for (const [prefix, value] of stats) {
  console.log(`${prefix}: ${value.count} objects, ${value.bytes} bytes${apply ? `, ${value.copied} copied` : ""}`);
}
if (verifyOnly) console.log("PASS: every Supabase object has a same-sized R2 copy.");
else if (!apply) console.log("Dry run only. Add --apply to copy files; source objects are never deleted.");
else console.log("Copy complete. Source objects were retained for rollback.");

} finally {
  await target.destroy();
}
