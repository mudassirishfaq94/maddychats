import test from "node:test";
import assert from "node:assert/strict";
import { androidNotificationStatus, hostedPush, saveHostedFile, openHostedCameraSettings } from "../src/lib/native-push-bridge";

test("native settings and status use bounded commands and preserve existing token registration replies", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const commands: string[] = [];
  const port = {
    onmessage: null as ((event: MessageEvent<string>) => void) | null,
    postMessage(raw: string) {
      const request = JSON.parse(raw);
      commands.push(request.command);
      assert.equal(typeof request.id, "string");
      queueMicrotask(() => port.onmessage?.({ data: JSON.stringify({ id: request.id, ...(request.command === "status" ? { status: { enabled: true, messagesImportance: 2 } } : request.command === "token" ? { token: "fixture-token" } : {}) }) } as MessageEvent<string>));
    },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { CircloPush: port } });
  try {
    const [status, token] = await Promise.all([androidNotificationStatus(), hostedPush("token")]);
    assert.deepEqual(status, { enabled: true, messagesImportance: 2 });
    assert.equal(token, "fixture-token");
    assert.equal(await hostedPush("settings"), null);
    assert.deepEqual(commands, ["status", "token", "settings"]);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window");
  }
});

test("native backup export transfers bounded, ordered chunks and opens only its camera settings command", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window"), bytes = new Uint8Array(450000).fill(7);
  const received: Uint8Array[] = []; let offset = 0;
  const port = { onmessage: null as ((event: MessageEvent<string>) => void) | null, postMessage(raw: string) {
    const value = JSON.parse(raw); let token = "";
    if (value.command === "backup-start") { assert.equal(value.file.size, bytes.length); token = "export-id"; }
    if (value.command === "backup-chunk") { assert.equal(value.file.transfer, "export-id"); assert.equal(value.file.offset, offset); const part = Uint8Array.from(Buffer.from(value.file.data, "base64")); assert(part.length <= 192 * 1024); received.push(part); offset += part.length; token = "chunk"; }
    if (value.command === "backup-finish") { assert.equal(offset, bytes.length); token = "saved"; }
    queueMicrotask(() => port.onmessage?.({ data: JSON.stringify({ id: value.id, token }) } as MessageEvent<string>));
  } };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { CircloPush: port } });
  try { assert.equal(await saveHostedFile(new Blob([bytes]), "backup.circlo"), true); assert.deepEqual(Buffer.concat(received), Buffer.from(bytes)); await openHostedCameraSettings(); }
  finally { if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window"); }
});
