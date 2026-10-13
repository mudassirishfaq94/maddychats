import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:net";
import { once } from "node:events";
import sharp from "sharp";
import { prepareReadableUpload, scanUpload } from "../src/server/upload-safety";
import { readBoundedBody } from "../src/server/http";

test("readable images are decoded, normalized, and never accepted by MIME alone", async () => {
  const prior = process.env.NODE_ENV; (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  try {
    const png = await sharp({ create: { width: 20, height: 30, channels: 3, background: "red" } }).png().toBuffer();
    const result = await prepareReadableUpload(new File([new Uint8Array(png)], "portrait.png", { type: "image/png" }), "avatar");
    assert.equal(result.mimeType, "image/webp");
    const metadata = await sharp(result.buffer).metadata();
    assert.equal(metadata.format, "webp"); assert.equal(metadata.width, 20); assert(!metadata.exif);
    await assert.rejects(prepareReadableUpload(new File(["<script>alert(1)</script>"], "fake.png", { type: "image/png" }), "avatar"), /contents do not match/);
    await assert.rejects(prepareReadableUpload(new File([new Uint8Array(png)], "fake.jpg", { type: "image/jpeg" }), "avatar"), /contents do not match/);
    await assert.rejects(prepareReadableUpload(new File([new Uint8Array(png.subarray(0, 12))], "broken.png", { type: "image/png" }), "avatar"), /safely decoded/);
  } finally { (process.env as Record<string, string | undefined>).NODE_ENV = prior; }
});

test("clamd protocol rejects infected, unavailable, and malformed scans", async () => {
  const previous = { host: process.env.CLAMAV_HOST, port: process.env.CLAMAV_PORT, node: process.env.NODE_ENV };
  let reply = "stream: OK\0";
  const server = createServer((socket) => {
    let bytes = Buffer.alloc(0);
    socket.on("data", (data) => {
      bytes = Buffer.concat([bytes, data]);
      if (bytes.length > 14 && bytes.subarray(-4).equals(Buffer.alloc(4))) {
        assert.equal(bytes.subarray(0, 10).toString(), "zINSTREAM\0"); socket.end(reply);
      }
    });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  process.env.CLAMAV_HOST = "127.0.0.1"; process.env.CLAMAV_PORT = String((server.address() as { port: number }).port);
  try {
    await scanUpload(Buffer.from("safe-test-payload"));
    reply = "stream: test-signature FOUND\0"; await assert.rejects(scanUpload(Buffer.from("test-payload")), /failed the safety scan/);
    reply = "stream: UNKNOWN\0"; await assert.rejects(scanUpload(Buffer.from("test-payload")), /did not complete/);
    process.env.CLAMAV_HOST = ""; (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    await assert.rejects(scanUpload(Buffer.from("test")), /unavailable/);
  } finally {
    process.env.CLAMAV_HOST = previous.host ?? ""; process.env.CLAMAV_PORT = previous.port ?? ""; (process.env as Record<string, string | undefined>).NODE_ENV = previous.node;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("streamed body bounds reject chunked payloads without Content-Length", async () => {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(10)); controller.enqueue(new Uint8Array(11)); controller.close(); } });
  const request = new Request("http://localhost", { method: "POST", body, duplex: "half" } as RequestInit);
  await assert.rejects(readBoundedBody(request, 20), /body_too_large/);
  assert.equal((await readBoundedBody(new Request("http://localhost", { method: "POST", body: "12345" }), 5)).length, 5);
});
