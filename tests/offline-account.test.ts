import assert from "node:assert/strict";
import { test } from "node:test";
import { activeAccount } from "../public/offline-store.js";
import { savedChatSnapshot } from "../src/lib/saved-chat-snapshot";

test("server rendering without browser storage cannot expose a saved account", () => {
  assert.equal(typeof localStorage, "undefined");
  assert.equal(activeAccount(), null);
  assert.equal(savedChatSnapshot("dddddddd-dddd-4ddd-8ddd-dddddddddddd", {}, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), null);
});

test("blocked browser storage fails closed when reading the active account", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new DOMException("Storage blocked", "SecurityError"); } });
    assert.equal(activeAccount(), null);
    assert.equal(savedChatSnapshot("dddddddd-dddd-4ddd-8ddd-dddddddddddd", {}, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), null);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
