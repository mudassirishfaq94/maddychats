import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

test('patched UUID retains the Google client CommonJS v4 contract and rejects undersized v5 buffers',()=>{
  const require=createRequire(import.meta.url);
  const googleRequire=createRequire(require.resolve('googleapis-common/package.json'));
  const uuid=googleRequire('uuid');
  assert.equal(googleRequire('uuid/package.json').version,'11.1.1');
  assert.match(uuid.v4(),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.throws(()=>uuid.v5('bounded-buffer-regression',uuid.NIL,new Uint8Array(1)));
});
