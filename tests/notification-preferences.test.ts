import test from "node:test";
import assert from "node:assert/strict";
import { notificationPreferencesSchema } from "../src/lib/schemas";

test("notification details can be explicitly enabled or hidden", () => {
  assert.equal(notificationPreferencesSchema.safeParse({ showNotificationDetails: true }).success, true);
  assert.equal(notificationPreferencesSchema.safeParse({ showNotificationDetails: false }).success, true);
});

test("notification preference updates still require at least one setting", () => {
  assert.equal(notificationPreferencesSchema.safeParse({}).success, false);
});
