import test from "node:test";
import assert from "node:assert/strict";
import { groupAllows, type GroupAction } from "../src/lib/group-permissions";
const defaults = { adminOnlyAddingMembers: false, adminOnlyEditingInfo: true, adminOnlyMessaging: false };
test("regular members can add and send by default; identity edits follow policy", () => {
  assert.equal(groupAllows("member", defaults, "addMembers"), true);
  assert.equal(groupAllows("member", defaults, "sendMessages"), true);
  assert.equal(groupAllows("member", defaults, "editInfo"), false);
  assert.equal(groupAllows("member", { ...defaults, adminOnlyEditingInfo: false }, "editInfo"), true);
  assert.equal(groupAllows("member", { ...defaults, adminOnlyAddingMembers: true }, "addMembers"), false);
  assert.equal(groupAllows("member", { ...defaults, adminOnlyMessaging: true }, "sendMessages"), false);
});
test("only admins/owners manage policy; unknown roles and nonmembers have no rights", () => {
  const actions: GroupAction[] = ["addMembers", "editInfo", "sendMessages", "managePermissions"];
  for (const action of actions) {
    assert.equal(groupAllows("owner", defaults, action), true);
    assert.equal(groupAllows("admin", defaults, action), true);
    for (const role of [undefined, null, "guest", "ADMIN"]) assert.equal(groupAllows(role, defaults, action), false);
  }
  assert.equal(groupAllows("member", defaults, "managePermissions"), false);
});
