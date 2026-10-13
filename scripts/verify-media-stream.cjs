const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const bytes = new Uint8Array(65536).fill(123);
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync('src/server/storage.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
vm.runInNewContext(code, {
  exports: exportsObject, console, Blob, ReadableStream,
  process: { cwd: () => process.cwd(), env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only' } },
  require: (name) => name === '@supabase/supabase-js' ? {
    createClient: () => ({ storage: { from: () => ({
      download: async () => ({ data: new Blob([bytes]), error: null }),
    }) } }),
  } : require(name),
});
(async () => {
  const stored = await exportsObject.readStored('images/regression');
  assert.equal(stored.size, bytes.byteLength);
  const response = new Response(stored.body, { headers: { 'Content-Length': String(stored.size) } });
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  console.log('PASS: streamed Supabase Storage downloads preserve bytes and content length');
})().catch(error => { console.error(error); process.exitCode = 1; });
