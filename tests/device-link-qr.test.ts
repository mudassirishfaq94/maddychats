import assert from "node:assert/strict";
import { test } from "node:test";
import { createDeviceLinkQrPayload, parseDeviceLinkQrPayload } from "@/lib/device-link-qr";

const requestId = "7d7a4aae-ec2a-4bd5-907a-62b99db3bcaf";
const token = "a".repeat(43);

test("device-link QR round-trips only a versioned request id and 256-bit token", () => {
  const encoded = createDeviceLinkQrPayload(requestId, token);
  assert.deepEqual(parseDeviceLinkQrPayload(encoded), { kind: "circlo-device-link", version: 1, requestId, token });
  assert.equal(encoded.includes("https://"), false, "the bearer token is not put in a URL");
});

test("device-link QR rejects wrong kind, version, malformed ids, short tokens, and oversized input", () => {
  for (const payload of [
    JSON.stringify({ kind: "contact", version: 1, requestId, token }),
    JSON.stringify({ kind: "circlo-device-link", version: 2, requestId, token }),
    JSON.stringify({ kind: "circlo-device-link", version: 1, requestId: "../request", token }),
    JSON.stringify({ kind: "circlo-device-link", version: 1, requestId, token: "123456" }),
    "x".repeat(513),
    "not-json",
  ]) assert.equal(parseDeviceLinkQrPayload(payload), null);
  assert.throws(() => createDeviceLinkQrPayload("invalid", token));
  assert.throws(() => createDeviceLinkQrPayload(requestId, "123456"));
});
