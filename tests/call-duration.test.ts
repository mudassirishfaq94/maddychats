import test from "node:test";
import assert from "node:assert/strict";
import { formatCallDuration } from "../src/lib/call-duration";

test("call duration formats minute and hour boundaries safely", () => {
  for (const [seconds, expected] of [[0, "0:00"], [9.8, "0:09"], [60, "1:00"], [3599, "59:59"], [3600, "1:00:00"], [3661, "1:01:01"], [-3, "0:00"], [NaN, "0:00"]] as const) {
    assert.equal(formatCallDuration(seconds), expected);
  }
});
