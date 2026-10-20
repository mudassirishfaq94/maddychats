import test from "node:test";
import assert from "node:assert/strict";
import {contactCodeId} from "../src/lib/contact-code";
const id="12345678-1234-4234-8234-123456789abc";
test("QR contact codes accept only exact Circlo contact links or valid IDs",()=>{
 assert.equal(contactCodeId(id),id);assert.equal(contactCodeId(`https://circlo.chat/contact/${id}`),id);
 for(const value of [`https://evil.example/contact/${id}`,`https://circlo.chat.evil.example/contact/${id}`,`javascript:alert(1)`,`https://circlo.chat@evil.example/contact/${id}`,`https://circlo.chat/contact/${id}?redirect=https://evil.example`,`https://circlo.chat/contact/${id}#x`,`https://circlo.chat/app/users/${id}`,"invalid"] )assert.equal(contactCodeId(value),null);
});
