import { Readable } from "node:stream";
import { ENCRYPTED_MEDIA_OVERHEAD, INLINE_MEDIA_MAX_BYTES } from "@/lib/media-limits";

/** R2 PutObject needs replayable bytes for request signing. Keep buffering bounded. */
export const MAX_R2_PUT_BYTES = INLINE_MEDIA_MAX_BYTES + ENCRYPTED_MEDIA_OVERHEAD;

export async function bufferR2UploadBody(
  body: Buffer | ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  expectedSize?: number,
  limit = MAX_R2_PUT_BYTES,
): Promise<Buffer> {
  if (Buffer.isBuffer(body)) {
    if (body.byteLength > limit) throw new Error("r2_object_too_large");
    if (expectedSize !== undefined && body.byteLength !== expectedSize) throw new Error("r2_object_size_mismatch");
    return body;
  }

  const stream = body instanceof ReadableStream
    ? Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>)
    : Readable.from(body as AsyncIterable<Uint8Array>);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > limit) throw new Error("r2_object_too_large");
    chunks.push(bytes);
  }
  if (expectedSize !== undefined && size !== expectedSize) throw new Error("r2_object_size_mismatch");
  return Buffer.concat(chunks, size);
}
