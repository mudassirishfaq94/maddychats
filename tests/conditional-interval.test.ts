import assert from "node:assert/strict";
import test from "node:test";
import { createConditionalInterval } from "../src/lib/conditional-interval";

test("idle/background polling has no timer; fallback resumes without duplicate intervals", () => {
  let eligible = false, starts = 0, stops = 0, runs = 0;
  let tick = () => {};
  const interval = createConditionalInterval(() => eligible, () => runs++, 2000, {
    start: run => { starts++; tick = run; return {} as ReturnType<typeof setInterval>; },
    stop: () => { stops++; },
  });
  interval.refresh(); assert.equal(starts, 0);
  eligible = true; interval.refresh(); interval.refresh(); assert.equal(starts, 1);
  tick(); assert.equal(runs, 1);
  eligible = false; tick(); assert.equal(runs, 1); assert.equal(stops, 1);
  eligible = true; interval.refresh(); assert.equal(starts, 2);
  interval.stop(); interval.stop(); assert.equal(stops, 2);
});
