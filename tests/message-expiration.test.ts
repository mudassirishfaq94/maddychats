import test from "node:test";
import assert from "node:assert/strict";
import {messageExpired,selfDestructDeadline,SELF_DESTRUCT_MS} from "../src/lib/message-expiration";
import {scheduledInstant} from "../src/lib/scheduled-time";
test("expiration boundary is inclusive and self-destruct is exactly five seconds",()=>{
 const start=new Date("2026-10-18T12:00:00Z"),deadline=selfDestructDeadline(start);
 assert.equal(deadline.getTime()-start.getTime(),SELF_DESTRUCT_MS);
 assert.equal(messageExpired({expiresAt:deadline},deadline.getTime()-1),false);
 assert.equal(messageExpired({expiresAt:deadline},deadline.getTime()),true);
 assert.equal(messageExpired({expiresAt:null},deadline.getTime()),false);
});
test("schedule instants require an explicit offset and preserve equivalent time zones",()=>{
 const now=Date.parse("2026-10-18T10:00:00Z");
 assert.equal(scheduledInstant("2026-10-18T18:00:00+04:00",now)?.toISOString(),"2026-10-18T14:00:00.000Z");
 assert.equal(scheduledInstant("2026-10-18T14:00:00Z",now)?.toISOString(),"2026-10-18T14:00:00.000Z");
 assert.equal(scheduledInstant("2026-10-18T18:00:00",now),null);
 assert.equal(scheduledInstant("2026-10-18T09:00:00Z",now),null);
 assert.equal(scheduledInstant("not-a-time",now),null);
});
