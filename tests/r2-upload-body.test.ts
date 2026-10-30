import assert from "node:assert/strict";
import { test } from "node:test";
import { Readable } from "node:stream";
import { bufferR2UploadBody, MAX_R2_PUT_BYTES } from "../src/server/r2-upload-body";
import { STATUS_MEDIA_OUTPUT_MAX_BYTES } from "../src/lib/media-limits";

test("status storage accepts larger media only with its dedicated bounded limit", async () => {
  const bytes=Buffer.alloc(12*1024*1024);
  await assert.rejects(bufferR2UploadBody(bytes),/r2_object_too_large/);
  assert.equal(await bufferR2UploadBody(bytes,bytes.length,STATUS_MEDIA_OUTPUT_MAX_BYTES),bytes);
  await assert.rejects(bufferR2UploadBody(bytes,bytes.length+1,STATUS_MEDIA_OUTPUT_MAX_BYTES),/r2_object_size_mismatch/);
  await assert.rejects(bufferR2UploadBody(Buffer.alloc(STATUS_MEDIA_OUTPUT_MAX_BYTES+1),undefined,STATUS_MEDIA_OUTPUT_MAX_BYTES),/r2_object_too_large/);
});

test("R2 upload body materializes Web streams into bytes for request signing", async () => {
  const expected = Buffer.from("encrypted-image-payload");
  const stream = new Blob([expected]).stream();
  const actual = await bufferR2UploadBody(stream, expected.byteLength);
  assert.deepEqual(actual, expected);
});

test("R2 upload body accepts existing buffers without changing bytes", async () => {
  const expected = Buffer.from([0, 1, 127, 128, 255]);
  assert.deepEqual(await bufferR2UploadBody(expected, expected.byteLength), expected);
});

test("R2 upload body rejects truncated streams", async () => {
  await assert.rejects(
    bufferR2UploadBody(new Blob(["short"]).stream(), 8),
    /r2_object_size_mismatch/,
  );
});

test("R2 upload body rejects streams beyond the bounded single-object size", async () => {
  const stream = new Blob([Buffer.alloc(MAX_R2_PUT_BYTES + 1)]).stream();
  await assert.rejects(bufferR2UploadBody(stream), /r2_object_too_large/);
});

test("R2 upload body accepts the full encrypted inline limit for buffers and streams", async () => {
  const expected = Buffer.alloc(10 * 1024 * 1024 + 28, 7);
  for (const body of [expected, new Blob([expected]).stream(), Readable.from([expected])]) {
    assert.deepEqual(await bufferR2UploadBody(body, expected.byteLength), expected);
  }
});

test("R2 upload body preserves buffer and Node stream size checks", async () => {
  const oversized = Buffer.alloc(10 * 1024 * 1024 + 29);
  for (const body of [oversized, Readable.from([oversized.subarray(0, 10 * 1024 * 1024), oversized.subarray(10 * 1024 * 1024)])]) {
    await assert.rejects(bufferR2UploadBody(body), /r2_object_too_large/);
  }
  for (const body of [Buffer.from("short"), Readable.from([Buffer.from("short")])]) {
    await assert.rejects(bufferR2UploadBody(body, 8), /r2_object_size_mismatch/);
  }
});

test("R2 upload body allows encrypted inline media overhead at the size limit", async () => {
  const payload = Buffer.alloc(MAX_R2_PUT_BYTES);
  assert.equal((await bufferR2UploadBody(payload)).byteLength, MAX_R2_PUT_BYTES);
});
