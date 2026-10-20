// Never loaded by production startup. Only the disposable loopback authorization fixture may use this mock.
const assert = require('node:assert/strict');
const { sign } = require('node:crypto');
const database = new URL(process.env.DATABASE_URL);
assert(['127.0.0.1', 'localhost'].includes(database.hostname) && database.pathname === '/item3_authorization_test');
assert.equal(process.env.CLIENT_URL, 'http://127.0.0.1:3109');
assert.equal(process.env.GOOGLE_CLIENT_ID, 'disposable-google-client');
assert(process.env.TEST_GOOGLE_PRIVATE_KEY && process.env.TEST_GOOGLE_PUBLIC_JWK);
const original = globalThis.fetch;
globalThis.fetch = async function(url, options) {
  const target = String(url instanceof Request ? url.url : url);
  if (target === 'https://www.googleapis.com/oauth2/v3/certs') {
    return Response.json({ keys: [JSON.parse(process.env.TEST_GOOGLE_PUBLIC_JWK)] }, { headers: { 'Cache-Control': 'public, max-age=600' } });
  }
  if (target === 'https://oauth2.googleapis.com/token') {
    const code = new URLSearchParams(options.body).get('code') || '';
    assert(/^fixture-(valid|wrong-nonce|wrong-audience):[A-Za-z0-9_-]+$/.test(code), 'Unexpected OAuth request in isolated mock');
    const [kind, nonce] = code.split(':');
    const now = Math.floor(Date.now() / 1000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const input = encode({ alg: 'RS256', kid: 'disposable-google-jwk', typ: 'JWT' }) + '.' + encode({
      iss: 'https://accounts.google.com', aud: kind === 'fixture-wrong-audience' ? 'another-app' : process.env.GOOGLE_CLIENT_ID,
      sub: 'disposable-google-identity', email: 'item3_alice@example.invalid', email_verified: true,
      nonce: kind === 'fixture-wrong-nonce' ? nonce + '-wrong' : nonce, iat: now, exp: now + 300,
    });
    const signature = sign('RSA-SHA256', Buffer.from(input), process.env.TEST_GOOGLE_PRIVATE_KEY).toString('base64url');
    return Response.json({ id_token: input + '.' + signature });
  }
  assert(["127.0.0.1", "localhost"].includes(new URL(target).hostname), "Third-party traffic is forbidden in the OAuth fixture");
  return original.call(this, url, options);
};
