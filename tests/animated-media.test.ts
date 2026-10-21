import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { ANIMATED_MEDIA, GIF_MEDIA, animatedMediaCatalog, animatedMediaPosterUrl, animatedMediaPreviewUrl, animatedMediaUrl } from "../src/lib/animated-media";

test("first-party GIFs and stickers contain real, bounded animation frames", async () => {
  for (const gif of [false, true]) for (const item of animatedMediaCatalog(gif)) {
    const url = animatedMediaUrl(item.id, gif); assert(url.startsWith(gif ? "/gifs/" : "/stickers/"));
    const bytes = await readFile("public" + url); assert(bytes.length < 256 * 1024);
    const image = sharp(bytes, { animated: true }); const metadata = await image.metadata();
    assert.equal(metadata.format, gif ? "gif" : "webp"); assert.equal(metadata.width, 192); assert.equal(metadata.pageHeight, 192);
    assert.equal(metadata.pages, 12); assert.equal(metadata.loop, 0);
    assert(metadata.delay!.every(delay => delay >= 100));
    const poster = await sharp(await readFile("public" + animatedMediaPosterUrl(item.id, gif))).metadata();
    assert.equal(poster.format, "png"); assert.equal(poster.width, 192);
    const pixels = await image.ensureAlpha().raw().toBuffer(); const pageBytes = 192 * 192 * 4;
    assert(!pixels.subarray(0, pageBytes).equals(pixels.subarray(pageBytes, 2 * pageBytes)), "The animation must have changing frames");
  }
  assert.throws(() => animatedMediaUrl("../../secret"), /Unknown/);
  assert.equal(GIF_MEDIA.some(gif => ANIMATED_MEDIA.some(sticker => String(sticker.id) === gif.id)), false, "Tabs have independent catalogs");
  assert.throws(() => animatedMediaUrl("hello", true), /Unknown/);
  assert.throws(() => animatedMediaUrl("orbit", false), /Unknown/);
  const sticker = await sharp(await readFile("public" + animatedMediaPosterUrl("hello"))).ensureAlpha().raw().toBuffer();
  for (const gif of GIF_MEDIA) {
    const pixels = await sharp(await readFile("public" + animatedMediaPosterUrl(gif.id, true))).ensureAlpha().raw().toBuffer();
    assert(!pixels.equals(sticker), "GIF scenes must not duplicate sticker artwork");
  }
});

test("WebP previews are smaller without losing animation timing or frames", async () => {
  for (const item of GIF_MEDIA) {
    const original = await readFile("public" + animatedMediaUrl(item.id, true));
    const preview = await readFile("public" + animatedMediaPreviewUrl(item.id, true));
    assert(preview.length < original.length);
    const before = await sharp(original, { animated: true }).metadata();
    const after = await sharp(preview, { animated: true }).metadata();
    assert.equal(after.format, "webp");
    assert.equal(after.pages, before.pages);
    assert.equal(after.pageHeight, before.pageHeight);
    assert.equal(after.loop, before.loop);
    assert.deepEqual(after.delay, before.delay);
  }
});
