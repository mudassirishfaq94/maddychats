import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { e2eeRequest, awaitE2EERead } from "../src/lib/e2ee-request";

test("encryption requests preserve errors and abort a stalled response body", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/stall") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write('{"keys":');
    } else if (req.url === "/empty") {
      res.writeHead(204).end();
    } else {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Device approval required" }));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const denied = await e2eeRequest(base);
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error, "Device approval required");
    assert.equal((await e2eeRequest(`${base}/empty`)).status, 204);
    await assert.rejects(e2eeRequest(`${base}/stall`, { signal: AbortSignal.timeout(100) }), /timed out or was cancelled/);
    const cancelled = AbortSignal.abort();
    await assert.rejects(e2eeRequest(base, { signal: cancelled }), /timed out or was cancelled/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("restoration stops waiting on a shared key load at its cancellation deadline", async () => {
  const controller = new AbortController();
  const pending = new Promise<string>(() => undefined);
  const waiting = awaitE2EERead(pending, controller.signal);
  controller.abort();
  await assert.rejects(waiting, /timed out/);
  await assert.rejects(awaitE2EERead(Promise.resolve("unused"), controller.signal), /timed out/);
  assert.equal(await awaitE2EERead(Promise.resolve("existing key"), new AbortController().signal), "existing key");
});
