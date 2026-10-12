import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { ANIMATED_MEDIA, animatedMediaUrl } from "../src/lib/animated-media";

test("first-party GIFs and stickers contain real, bounded animation frames", async () => {
  for (const item of ANIMATED_MEDIA) for (const gif of [false, true]) {
    const url = animatedMediaUrl(item.id, gif); assert(url.startsWith(gif ? "/gifs/" : "/stickers/"));
    const bytes = await readFile("public" + url); assert(bytes.length < 256 * 1024);
    const image = sharp(bytes, { animated: true }); const metadata = await image.metadata();
    assert.equal(metadata.format, gif ? "gif" : "webp"); assert.equal(metadata.width, 192); assert.equal(metadata.pageHeight, 192);
    assert.equal(metadata.pages, 12); assert.equal(metadata.loop, 0);
    assert(metadata.delay!.every(delay => delay >= 100));
    const pixels = await image.ensureAlpha().raw().toBuffer(); const pageBytes = 192 * 192 * 4;
    assert(!pixels.subarray(0, pageBytes).equals(pixels.subarray(pageBytes, 2 * pageBytes)), "The animation must have changing frames");
  }
  assert.throws(() => animatedMediaUrl("../../secret"), /Unknown/);
});
