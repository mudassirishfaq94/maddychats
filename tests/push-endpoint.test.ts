import assert from "node:assert/strict";
import test from "node:test";
import { isSupportedPushEndpoint } from "../src/lib/push-endpoint";

test("push delivery only permits HTTPS browser push providers, without credentials or alternate ports", () => {
  for (const endpoint of ["https://fcm.googleapis.com/fcm/send/test", "https://updates.push.services.mozilla.com/wpush/v2/test", "https://web.push.apple.com/test", "https://wns.notify.windows.com/test"]) assert(isSupportedPushEndpoint(endpoint));
  for (const endpoint of ["https://127.0.0.1/test", "https://169.254.169.254/test", "http://fcm.googleapis.com/test", "https://fcm.googleapis.com.evil.example/test", "https://fcm.googleapis.com:8443/test", "https://username:password@fcm.googleapis.com/test", "https://evilnotify.windows.com/test", "https://internal.example/test"]) assert.equal(isSupportedPushEndpoint(endpoint), false, endpoint);
});
