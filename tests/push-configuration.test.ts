import assert from "node:assert/strict";
import test from "node:test";
import webPush from "web-push";
import { pushConfiguration } from "../src/server/push-configuration";

test("push configuration reads runtime keys, rejects mismatched pairs, and requires a contact", () => {
  const names = ["VAPID_PUBLIC_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    assert.equal(pushConfiguration(), null);
    const pair = webPush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = pair.publicKey;
    process.env.VAPID_PRIVATE_KEY = pair.privateKey;
    process.env.VAPID_SUBJECT = "mailto:test@example.invalid";
    assert.equal(pushConfiguration()?.publicKey, pair.publicKey);
    process.env.VAPID_PRIVATE_KEY = webPush.generateVAPIDKeys().privateKey;
    assert.equal(pushConfiguration(), null);
    process.env.VAPID_PRIVATE_KEY = pair.privateKey;
    delete process.env.VAPID_SUBJECT;
    assert.equal(pushConfiguration(), null);
  } finally { for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; } }
});
