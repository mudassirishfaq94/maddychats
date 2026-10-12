import { test } from "node:test";
import assert from "node:assert/strict";
import { databasePoolMax } from "../src/lib/database-settings";
test("database pool configuration cannot become unbounded or NaN", () => {
  for (const value of [undefined, "", "0", "-1", "Infinity", "NaN", "1.5"]) assert.equal(databasePoolMax(value), 5);
  assert.equal(databasePoolMax("5"), 5);
  assert.equal(databasePoolMax("5000"), 20);
});
