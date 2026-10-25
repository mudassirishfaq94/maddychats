import assert from "node:assert/strict";
import { test } from "node:test";
import { bufferR2UploadBody, MAX_R2_PUT_BYTES } from "../src/server/r2-upload-body";

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

test("R2 upload body allows encrypted inline media overhead at the size limit", async () => {
  const payload = Buffer.alloc(MAX_R2_PUT_BYTES);
  assert.equal((await bufferR2UploadBody(payload)).byteLength, MAX_R2_PUT_BYTES);
});
