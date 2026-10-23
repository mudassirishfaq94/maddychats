import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";

let server: Server;
let endpoint = "";
let mode: "r2-object" | "supabase-fallback" | "r2-error" = "r2-object";
let fallbackAuthorization = "";
let readStored: typeof import("../src/server/storage").readStored;

before(async () => {
  server = createServer((request, response) => {
    const path = request.url ?? "";
    if (path.startsWith("/circlo-media/images/") && mode === "r2-object") {
      const body = Buffer.from("ciphertext-from-r2");
      response.writeHead(200, { "content-length": body.byteLength, etag: '"test-etag"' });
      response.end(body);
      return;
    }
    if (path.startsWith("/circlo-media/images/") && mode === "r2-error") {
      response.writeHead(503, { "content-type": "application/xml" });
      response.end("<Error><Code>ServiceUnavailable</Code></Error>");
      return;
    }
    if (path.startsWith("/circlo-media/images/") && mode === "supabase-fallback") {
      response.writeHead(404, { "content-type": "application/xml", "x-amz-request-id": "test" });
      response.end("<Error><Code>NoSuchKey</Code><Message>Not found</Message></Error>");
      return;
    }
    if (path.startsWith("/storage/v1/object/authenticated/maddy-media/images/")) {
      fallbackAuthorization = String(request.headers.authorization ?? "");
      const body = Buffer.from("ciphertext-from-supabase");
      response.writeHead(200, { "content-length": body.byteLength });
      response.end(body);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Mock storage server did not start.");
  endpoint = `http://127.0.0.1:${address.port}`;

  process.env.MEDIA_STORAGE_BACKEND = "r2";
  process.env.R2_ACCOUNT_ID = "test-account";
  process.env.R2_ACCESS_KEY_ID = "test-access";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret";
  process.env.R2_BUCKET = "circlo-media";
  process.env.R2_ENDPOINT = endpoint;
  process.env.SUPABASE_URL = endpoint;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-supabase-service-key";
  process.env.SUPABASE_STORAGE_BUCKET = "maddy-media";
  ({ readStored } = await import("../src/server/storage"));
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  for (const key of ["MEDIA_STORAGE_BACKEND", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_ENDPOINT", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET"]) delete process.env[key];
});

test("private media reads from R2 without changing its ciphertext bytes", async () => {
  mode = "r2-object";
  const stored = await readStored("images/r2-object");
  assert.ok(stored);
  assert.equal(stored.size, Buffer.byteLength("ciphertext-from-r2"));
  assert.deepEqual(Buffer.from(await new Response(stored.body as BodyInit).arrayBuffer()), Buffer.from("ciphertext-from-r2"));
});

test("a missing R2 object falls back to authenticated Supabase during migration", async () => {
  mode = "supabase-fallback";
  fallbackAuthorization = "";
  const stored = await readStored("images/legacy-object");
  assert.ok(stored);
  assert.equal(fallbackAuthorization, "Bearer test-supabase-service-key");
  assert.deepEqual(Buffer.from(await new Response(stored.body as BodyInit).arrayBuffer()), Buffer.from("ciphertext-from-supabase"));
});

test("R2 service failures do not silently switch providers", async () => {
  mode = "r2-error";
  fallbackAuthorization = "";
  await assert.rejects(readStored("images/r2-error"));
  assert.equal(fallbackAuthorization, "");
});
