import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { LogoWordmark } from "../src/components/brand/logo";
import { prepareAvatarPhoto } from "../src/server/status-photo";

test("approved monochrome linked-circle brand is consistent across web assets", async () => {
  const html = renderToStaticMarkup(createElement(LogoWordmark));
  assert.equal((html.match(/<circle /g) ?? []).length, 2);
  assert(html.includes("circlo") && !html.includes("--brand-key"));
  for (const name of ["circlo-dark.svg", "circlo-light.svg"]) {
    const svg = await readFile(`public/brand/${name}`, "utf8");
    assert.equal((svg.match(/<circle /g) ?? []).length, 2);
    assert(svg.includes('viewBox="0 0 96 96"'));
  }
  for (const size of [192, 512]) assert.equal((await sharp(`public/icons/circlo-${size}.png`).metadata()).width, size);
  const favicon = await readFile("src/app/favicon.ico"); assert.equal(favicon.readUInt16LE(2), 1);
});

test("starter profile photos use bounded pixel reconstruction; configured scanners remain mandatory", async () => {
  const before = { starter: process.env.STARTER_MODE, host: process.env.CLAMAV_HOST, port: process.env.CLAMAV_PORT };
  process.env.STARTER_MODE = "1"; delete process.env.CLAMAV_HOST;
  try {
    const png = await sharp({ create: { width: 1400, height: 1100, channels: 3, background: "black" } }).png().toBuffer();
    const file = new File([new Uint8Array(Buffer.concat([png, Buffer.from("TRAILING_PAYLOAD")]))], "photo.png", { type: "image/png" });
    const result = await prepareAvatarPhoto(file);
    const metadata = await sharp(result.buffer).metadata();
    assert.equal(result.mimeType, "image/webp"); assert(metadata.width! <= 1024 && metadata.height! <= 1024);
    assert(!result.buffer.includes(Buffer.from("TRAILING_PAYLOAD")) && !metadata.exif);
    await assert.rejects(prepareAvatarPhoto(new File(["<svg/>"], "fake.png", { type: "image/png" })), /contents do not match/);
    await assert.rejects(prepareAvatarPhoto(new File([new Uint8Array(3 * 1024 * 1024 + 1)], "huge.png", { type: "image/png" })), /large|smaller/);
    process.env.CLAMAV_HOST = "127.0.0.1"; process.env.CLAMAV_PORT = "0";
    await assert.rejects(prepareAvatarPhoto(file), /scanning is unavailable/);
  } finally {
    for (const [name, value] of [["STARTER_MODE", before.starter], ["CLAMAV_HOST", before.host], ["CLAMAV_PORT", before.port]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
