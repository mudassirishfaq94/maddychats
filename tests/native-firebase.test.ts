import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { deleteApp, getApps } from "firebase-admin/app";
import { nativeFirebaseMessaging } from "../src/server/native-firebase";

test("actual installed Firebase SDK initializes native messaging, reuses it and rejects project drift without provider calls", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const configuration = { projectId: "disposable-circlo-test", clientEmail: "test@disposable-circlo-test.iam.gserviceaccount.com", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
  try {
    const messaging = nativeFirebaseMessaging(configuration);
    assert.equal(typeof messaging.send, "function");
    assert.equal(messaging.app.options.projectId, configuration.projectId);
    assert.equal(nativeFirebaseMessaging(configuration), messaging);
    assert.throws(() => nativeFirebaseMessaging({ ...configuration, projectId: "other-project" }), /project mismatch/);
    // No send/token exchange: this tests SDK compatibility, not real FCM delivery.
  } finally {
    for (const app of getApps().filter(app => app.name === "circlo-native-push")) await deleteApp(app);
  }
});
