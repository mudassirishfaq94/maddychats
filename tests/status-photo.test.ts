import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { reconstructStatusPhoto } from "../src/server/status-photo";

test("status photos store reconstructed pixels, stripping containers and metadata", async () => {
  for (const format of ["png", "jpeg", "webp"] as const) {
    const original = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#174f46" } }).withExif({ IFD0: { Artist: "PRIVATE_PHOTO_METADATA" } }).toFormat(format).toBuffer();
    const bytes = Buffer.concat([original, Buffer.from("APPENDED_UNTRUSTED_CONTENT")]);
    const result = await reconstructStatusPhoto(new File([bytes], `photo.${format}`, { type: `image/${format}` }));
    const metadata = await sharp(result.buffer).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 32);
    assert.equal(metadata.height, 24);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert(!result.buffer.includes(Buffer.from("APPENDED_UNTRUSTED_CONTENT")));
    assert(!result.buffer.includes(Buffer.from("PRIVATE_PHOTO_METADATA")));
  }
});

test("status photo reconstruction rejects spoofed, corrupt, oversized and non-photo uploads", async () => {
  await assert.rejects(reconstructStatusPhoto(new File(["<svg onload='alert(1)'/>"], "fake.png", { type: "image/png" })));
  await assert.rejects(reconstructStatusPhoto(new File(["video"], "video.mp4", { type: "video/mp4" })));
  await assert.rejects(reconstructStatusPhoto(new File([Buffer.alloc(10 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })));
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(reconstructStatusPhoto(new File([png.subarray(0, 20)], "corrupt.png", { type: "image/png" })));
  await assert.rejects(reconstructStatusPhoto(new File([png], "wrong.jpg", { type: "image/jpeg" })));
  const tooManyPixels = await sharp({ create: { width: 4001, height: 3000, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(reconstructStatusPhoto(new File([tooManyPixels], "pixels.png", { type: "image/png" })));
});

test("photos above the former 3 MB ceiling are reconstructed without retaining appended data", async () => {
  const png = await sharp({ create: { width: 32, height: 24, channels: 3, background: "white" } }).png().toBuffer();
  const bytes = Buffer.concat([png, Buffer.alloc(4 * 1024 * 1024)]);
  const result = await reconstructStatusPhoto(new File([bytes], "large-valid.png", { type: "image/png" }));
  assert(result.buffer.length < 3 * 1024 * 1024);
  assert.equal((await sharp(result.buffer).metadata()).width, 32);
});
