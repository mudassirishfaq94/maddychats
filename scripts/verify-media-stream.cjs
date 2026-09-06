const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const bytes = new Uint8Array(65536).fill(123);
let headers;
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync('src/server/storage.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
vm.runInNewContext(code, {
  exports: exportsObject, console, process: { cwd: () => process.cwd(), env: { BLOB_READ_WRITE_TOKEN: 'test-only' } },
  require: (name) => name === '@vercel/blob' ? {
    get: async () => ({ statusCode: 200, stream: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }), headers, blob: { size: 0 } }),
  } : require(name),
});
(async () => {
  for (const length of [null, '65536', 'invalid']) {
    headers = new Headers(length === null ? {} : { 'content-length': length });
    const stored = await exportsObject.readStored('images/regression');
    assert.equal(stored.size, length === '65536' ? 65536 : null);
    const response = new Response(stored.body, { headers: stored.size === null ? {} : { 'Content-Length': String(stored.size) } });
    assert.notEqual(response.headers.get('content-length'), '0');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  }
  console.log('PASS: streamed Blob downloads preserve bytes with missing, valid, or malformed Content-Length');
})().catch(error => { console.error(error); process.exitCode = 1; });
