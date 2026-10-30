import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import type * as Snapshot from "../src/lib/saved-chat-snapshot";

const compiled = build({ stdin: { contents: 'export * from "./src/lib/saved-chat-snapshot";', resolveDir: process.cwd() }, bundle: true, write: false, format: "cjs", platform: "node",
  plugins: [{ name: "encrypted-store-io", setup(builder) {
    builder.onResolve({ filter: /offline-store\.js$/ }, () => ({ path: "store", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const activeAccount=()=>state.account;export const chatLocked=()=>state.locked;export const offlineChats=async()=>state.chats;export const offlineHistory=async()=>state.history;" }));
  } }],
});
async function fixture() {
  const state = { account: "a", locked: false, chats: [{ id: "chat", name: "Private fixture", blocked: false, requestPending: false }], history: Promise.resolve({ messages: [{ id: "m", kind: "message", text: "fixture" }, { id: "e", kind: "ephemeral", text: "excluded" }] }) };
  const loaded = { exports: {} };
  runInNewContext((await compiled).outputFiles[0].text, { module: loaded, state, Date });
  return { state, api: loaded.exports as typeof Snapshot };
}
test("pending local history cannot republish after access invalidation", async () => {
  const { state, api } = await fixture(), scope = {};
  let release!: (value: { messages: { id: string; kind: string; text: string }[] }) => void;
  state.history = new Promise(resolve => { release = resolve; });
  const pending = api.prepareSavedChatSnapshot("a", scope, "chat");
  api.invalidateSavedChatSnapshots("a", "chat");
  release({ messages: [{ id: "m", kind: "message", text: "fixture" }] });
  assert.equal(await pending, null);
  assert.equal(api.savedChatSnapshot("a", scope, "chat"), null);
});
test("prepared plaintext stays isolated by login scope, account and chat lock", async () => {
  const { state, api } = await fixture(), scope = {};
  const ready = await api.prepareSavedChatSnapshot("a", scope, "chat");
  assert.equal(ready?.messages.length, 1, "Ephemeral rows never enter the handoff");
  assert.equal(api.savedChatSnapshot("a", scope, "chat"), ready);
  assert.equal(api.savedChatSnapshot("a", {}, "chat"), null);
  state.account = "b";
  assert.equal(api.savedChatSnapshot("a", scope, "chat"), null);
  state.account = "a"; state.locked = true;
  assert.equal(api.savedChatSnapshot("a", scope, "chat"), null);
});
test("blocked and pending-message-request chats cannot prepare local text", async () => {
  for (const field of ["blocked", "requestPending"] as const) {
    const { state, api } = await fixture(); state.chats[0][field] = true;
    assert.equal(await api.prepareSavedChatSnapshot("a", {}, "chat"), null);
  }
});
