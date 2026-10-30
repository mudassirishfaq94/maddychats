import { test } from "node:test";
import assert from "node:assert/strict";
import { adminDestination, postSignInPath, deviceAccessDestination, deviceAccessPath } from "../src/lib/device-access-navigation";

test("post-auth device setup preserves private destinations without external redirects or loops", () => {
  for (const path of [undefined, "https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/login", "/app\n", "/app/device-access?next=/app/device-access"]) assert.equal(deviceAccessDestination(path), "/app");
  const path = "/app/chats/123?from=notification#latest";
  assert.equal(deviceAccessDestination(path), path);
  assert.equal(deviceAccessPath(path), "/app/device-access?next=" + encodeURIComponent(path));
  const reauth = "/app/device-access?recovery=1&next=%2Fapp%2Fchats";
  assert.equal(deviceAccessPath(reauth), reauth);
});


test("admin returns go to guarded admin pages; chat returns still require device setup", () => {
  for (const path of ["/app/admin", "/app/admin/users?search=test#roles"]) assert.equal(postSignInPath(path), path);
  for (const path of [undefined, "https://evil.invalid/app/admin", "//evil.invalid/app/admin", "/app/administrator", "/app/admin/../chats", "/app/admin\\chats", "/app/admin\n"]) assert.equal(adminDestination(path), null);
  assert.equal(postSignInPath("/app/chats"), deviceAccessPath("/app/chats"));
});
