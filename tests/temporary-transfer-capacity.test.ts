import test from "node:test";
import assert from "node:assert/strict";
import { reserveTemporaryTransfer } from "../src/server/temporary-transfer-capacity";
test("large temporary transfers have a bounded, reusable memory slot",()=>{
 const first=reserveTemporaryTransfer();assert(first);assert.equal(reserveTemporaryTransfer(),null);first();const next=reserveTemporaryTransfer();assert(next);first();assert.equal(reserveTemporaryTransfer(),null,"Repeated cleanup cannot release somebody else's lease");next();const last=reserveTemporaryTransfer();assert(last);last();
});
