import test from "node:test";
import assert from "node:assert/strict";
import { androidNotificationStatus, hostedPush } from "../src/lib/native-push-bridge";

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
