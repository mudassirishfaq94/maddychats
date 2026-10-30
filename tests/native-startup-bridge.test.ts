import assert from "node:assert/strict";
import test from "node:test";
import { syncHostedStartup } from "../src/lib/native-push-bridge";

test("startup selection binds the current account and clears on logout without notification registration", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const commands: { command: string; userId?: string }[] = [];
  const port = {
    onmessage: null as ((event: { data: string }) => void) | null,
    postMessage(raw: string) {
      const message = JSON.parse(raw);
      commands.push({ command: message.command, userId: message.userId });
      this.onmessage?.({ data: JSON.stringify({ id: message.id }) });
    },
  };
  Object.defineProperty(globalThis, "window", { value: { CircloPush: port }, configurable: true });
  try {
    await syncHostedStartup("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await syncHostedStartup("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    await syncHostedStartup(null);
    assert.deepEqual(commands, [
      { command: "startup-bind", userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      { command: "startup-bind", userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      { command: "startup-clear", userId: undefined },
    ]);
    Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
    await syncHostedStartup(null); // Ordinary web and old APKs do not gain a native dependency.
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
