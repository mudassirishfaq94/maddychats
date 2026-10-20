import assert from 'node:assert/strict';
import test from 'node:test';
import { SignJWT } from 'jose';
import { createGoogleMobileHandoff, verifyGoogleMobileHandoff } from '../src/server/google-mobile-handoff';

test('mobile handoff binds policy acceptance to the signed OAuth result', async () => {
  const saved = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'disposable-mobile-policy-test-secret-at-least-thirty-two';
  try {
    const challenge = 'a'.repeat(43);
    const ticket = await createGoogleMobileHandoff('fixture-user', 'fixture', challenge);
    assert.deepEqual(await verifyGoogleMobileHandoff(ticket), { userId: 'fixture-user', username: 'fixture', codeChallenge: challenge });
    const old = await new SignJWT({ usr: 'fixture', codeChallenge: challenge }).setProtectedHeader({ alg: 'HS256' }).setSubject('fixture-user').setIssuer('circlo').setAudience('circlo-google-mobile-handoff').setIssuedAt().setExpirationTime('120s').sign(new TextEncoder().encode(process.env.JWT_SECRET));
    assert.equal(await verifyGoogleMobileHandoff(old), null, 'An older ticket without signed agreement cannot bypass the policy gate');
  } finally { if (saved === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = saved; }
});
