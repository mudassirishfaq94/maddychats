import test from "node:test";
import assert from "node:assert/strict";
import { circloGuides,findCircloGuides } from "../src/lib/circlo-help";
test("built-in help returns maintained app guides and declines unrelated questions",()=>{
 assert.equal(findCircloGuides("How do I schedule a message?")[0].id,"scheduled");
 assert.equal(findCircloGuides("My microphone does not work for calls")[0].id,"calls");
 assert.equal(findCircloGuides("I lost my recovery key")[0].id,"recovery");
 assert.equal(findCircloGuides("How do I save a backup?")[0].id,"backup");
 assert.equal(findCircloGuides("How do I save a backup?")[0].href,"/app/profile#local-chat-backup");
 assert.equal(findCircloGuides("How can a guest join by code?")[0].id,"temporary");
 assert.deepEqual(findCircloGuides("What is the weather tomorrow?"),[]);
 assert(circloGuides.every(guide=>guide.href.startsWith("/")&&!guide.href.startsWith("//")&&guide.steps.length>0));
 assert(circloGuides.find(guide=>guide.id==="recovery")!.note!.includes("may be lost"));
});
