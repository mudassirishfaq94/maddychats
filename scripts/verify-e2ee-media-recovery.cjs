const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(file, dependencies) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => dependencies[name], crypto: globalThis.crypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, btoa, atob, AbortSignal, AbortController, Blob, URL, console, clearTimeout, fetch: (...args) => globalThis.fetch(...args), setTimeout });
  return exports;
}
(async () => {
  const crypto = load('src/lib/crypto.ts', {});
  const pair = await crypto.generateKeyPair();
  const senderKey = await crypto.generateConversationKey();
  const staleKey = await crypto.generateConversationKey();
  const mediaKey = await crypto.generateConversationKey();
  const bytes = new TextEncoder().encode('image bytes regression');
  const ciphertext = await crypto.encryptBytes(bytes, mediaKey);
  const wrapped = await crypto.encryptMessage(await crypto.exportSymmetricKey(mediaKey), senderKey);
  const keys = new Map([['chat', staleKey]]);
  const receiveKeys = new Map();
  const refs = [{ current: pair }, { current: keys }, {current: receiveKeys}];
  const react = { useCallback: (fn) => fn, useEffect: () => {}, useRef: () => refs.shift(), useState: (value) => [value, () => {}] };
  const hook = load('src/hooks/use-e2ee.ts', { react, '@/lib/crypto': crypto }).useE2EE('receiver');
  const wrong = await crypto.encryptKeyForUser(staleKey, pair.publicKey);
  const correct = await crypto.encryptKeyForUser(senderKey, pair.publicKey);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ keys: [{ encryptedKey: wrong }, { encryptedKey: correct }] }) });
  assert.equal(new TextDecoder().decode(await hook.decryptMedia(ciphertext, wrapped, 'chat')), 'image bytes regression');
  assert.equal(keys.get('chat'), staleKey, 'receiving must preserve the sending key');
  receiveKeys.clear();
  globalThis.fetch = async (url) => ({ ok: true, json: async () => url.includes('history') ? { history: [{ encryptedKey: correct }] } : { keys: [] } });
  assert.equal(new TextDecoder().decode(await hook.decryptMedia(ciphertext, wrapped, 'chat')), 'image bytes regression');
  receiveKeys.clear();
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ keys: [] }) });
  await assert.rejects(hook.decryptMedia(ciphertext, wrapped, 'chat'), /key is not available/);
  assert.equal(keys.get('chat'), staleKey);
  // Exercise the actual attachment hook without a DOM renderer.
  let context;
  let effect;
  let state;
  const uiReact = {
    createContext: () => ({}), useContext: () => context,
    useMemo: (fn) => fn(), useEffect: (fn) => { effect = fn; },
    useState: (initial) => { state = initial; return [initial, (next) => { state = next; }]; },
  };
  const ui = load('src/components/chats/e2ee-context.tsx', { react: uiReact, 'react/jsx-runtime': {} });
  const attachment = { id: 'test-media', url: '/media/test', encrypted: true, encKey: wrapped, mimeType: 'image/png' };
  let fetchCount = 0;
  globalThis.fetch = async () => { fetchCount++; return { ok: true, arrayBuffer: async () => new Uint8Array(64).buffer }; };
  context = { initialized: false, initializationError: null, conversationId: 'chat', decryptMedia: async () => bytes.buffer };
  assert.equal(ui.useEncryptedAttachmentUrl(attachment).failed, false);
  effect();
  assert.equal(fetchCount, 0, 'must wait for device initialization');
  assert.equal(ui.useEncryptedAttachmentUrl({ ...attachment, encKey: null }).failed, true);
  effect();
  assert.equal(fetchCount, 0, 'must not render ciphertext when its key is missing');
  let attempts = 0;
  context = { ...context, initialized: true, decryptMedia: async () => {
    if (++attempts === 1) throw new Error('key not yet shared');
    return bytes.buffer;
  } };
  ui.useEncryptedAttachmentUrl(attachment);
  const cleanup = effect();
  const deadline = Date.now() + 5000;
  while (!state.url && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(attempts, 2, 'late keys should be retried');
  assert.ok(state.url?.startsWith('blob:'));
  URL.revokeObjectURL(state.url);
  cleanup();
  console.log('PASS: media initialization gate, missing-key failure, late-key retry');
  console.log('PASS: recipient shared-key fallback, history fallback, missing-key failure, sending-key preservation');
})().catch((error) => { console.error(error); process.exitCode = 1; });
