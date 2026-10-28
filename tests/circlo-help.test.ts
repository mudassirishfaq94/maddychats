import test from "node:test";
import assert from "node:assert/strict";
import { circloGuides,findCircloGuides } from "../src/lib/circlo-help";
test("built-in help returns maintained app guides and declines unrelated questions",()=>{
 assert.equal(findCircloGuides("How do I schedule a message?")[0].id,"scheduled");
 assert.equal(findCircloGuides("My microphone does not work for calls")[0].id,"calls");
 assert.equal(findCircloGuides("I lost my recovery key")[0].id,"recovery");
 assert.equal(findCircloGuides("How can a guest join by code?")[0].id,"temporary");
 assert.deepEqual(findCircloGuides("What is the weather tomorrow?"),[]);
 assert(circloGuides.every(guide=>guide.href.startsWith("/")&&!guide.href.startsWith("//")&&guide.steps.length>0));
 const recovery=circloGuides.find(guide=>guide.id==="recovery")!;
 assert(recovery.note!.includes("Without a phone that can read them or a saved file"));
 assert(recovery.note!.includes("Circlo cannot bring them back"),"Plain wording must retain the warning that lost access cannot be recreated");
 assert.equal(recovery.href,"/app/settings#save-my-chats");
});
