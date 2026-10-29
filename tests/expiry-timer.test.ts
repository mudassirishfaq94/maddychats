import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scheduleMonotonicDeadline} from '../src/lib/expiry-timer';

test('an early wake-up cannot strand a fractional expiry deadline', t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let now=100,notifications=0;
  scheduleMonotonicDeadline(100.25,()=>notifications++,()=>now);
  now=100.2;t.mock.timers.tick(2);assert.equal(notifications,0,'Not expired yet');
  now=100.25;t.mock.timers.tick(2);assert.equal(notifications,1,'Recheck the actual deadline after an early wake-up');
  t.mock.timers.tick(100);assert.equal(notifications,1);
});
test('cancellation and already expired previews do not leave stale timers',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let notifications=0;
  const cancel=scheduleMonotonicDeadline(10,()=>notifications++,()=>0);
  cancel();t.mock.timers.tick(20);assert.equal(notifications,0);
  scheduleMonotonicDeadline(10,()=>notifications++,()=>11);assert.equal(notifications,1);
});
