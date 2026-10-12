import { test } from "node:test";
import assert from "node:assert/strict";
import { readBoundedBody } from "../src/server/http";

function request(body: ReadableStream<Uint8Array>) {
  return new Request("http://127.0.0.1/", { method: "POST", body, duplex: "half" } as RequestInit);
}
test("bounded readers terminate stalled streams and still enforce byte limits", async () => {
  let canceled = false;
  const stalled = request(new ReadableStream<Uint8Array>({ cancel() { canceled = true; } }));
  await assert.rejects(readBoundedBody(stalled, 64, 10), /body_read_timeout/);
  assert(canceled);
  const oversized = request(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(65)); } }));
  await assert.rejects(readBoundedBody(oversized, 64, 1000), /body_too_large/);
  const small = request(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("ok")); controller.close(); } }));
  assert.equal(new TextDecoder().decode(await readBoundedBody(small, 64, 1000)), "ok");
});
