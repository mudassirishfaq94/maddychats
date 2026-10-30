import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { isActiveContentType, normalizeMediaType } from "../src/lib/media-types";
import { validateUpload } from "../src/server/storage";
import { stageToken,readStage,createStage,appendStage,stageOffset,claimStage,abandonStage } from "../src/server/staged-media";
test("generic Android document MIME becomes a real reader association without overriding active content",()=>{
  for(const [name,type] of [["check.pdf","application/pdf"],["check.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document"],["check.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],["check.doc","application/msword"],["check.xls","application/vnd.ms-excel"]]){
    assert.equal(normalizeMediaType(name,"application/octet-stream"),type);
    assert.equal(validateUpload(name,"application/octet-stream",1024,"message").ok,true);
    assert.equal(normalizeMediaType(name,"text/html"),"text/html");
    assert.equal(validateUpload(name,"text/html",1024,"message").ok,false);
  }
});
test("Android JPEG aliases and missing picker MIME are accepted without permitting mismatched or active files",()=>{
  for(const mime of ["image/jpg","image/pjpeg","application/octet-stream",""])assert.equal(validateUpload("photo.JPG",mime,128*1024,"message").ok,true,mime);
  assert.equal(normalizeMediaType("photo.heif",""),"image/heif");
  assert.equal(validateUpload("photo.jpg","image/png",128000,"message").ok,false);
  assert.equal(validateUpload("payload.svg","image/svg+xml",128000,"message").ok,false);
  for (const [name, mime] of [
    ["notes.pdf", "text/html; charset=utf-8"],
    ["notes.txt", "application/xhtml+xml"],
    ["photo.png", "image/svg+xml"],
    ["script.txt", "text/javascript"],
  ]) assert.equal(validateUpload(name, mime, 128000, "message").ok, false, `${name} / ${mime}`);
  assert.equal(isActiveContentType(" Text/HTML ; charset=UTF-8 "), true);
  assert.equal(isActiveContentType("application/pdf"), false);
  assert.equal(validateUpload("payload.exe.jpg","image/jpeg",128000,"message").ok,false);
  for (const name of ["Screenshot2_123.circlo.app.jpg", "Screenshot_example.com.JPG"]) {
    assert.equal(validateUpload(name,"image/jpeg",128000,"message").ok,true,name);
  }
  assert.equal(validateUpload("payload.app","image/jpeg",128000,"message").ok,false);
  assert.equal(validateUpload("payload.com","image/jpeg",128000,"message").ok,false);
  assert.equal(validateUpload("clip.mkv","application/octet-stream",1024,"message").ok,true);
});
test("APK and ordinary unknown file formats can be shared as encrypted attachments",()=>{
  assert.equal(validateUpload("app-debug.apk","application/vnd.android.package-archive",5*1024*1024,"message").ok,true);
  assert.equal(validateUpload("app-debug.apk","application/octet-stream",5*1024*1024,"message").ok,true);
  assert.equal(validateUpload("archive.custom","application/x-custom-format",1024,"message").ok,true);
  assert.equal(validateUpload("payload.exe","application/octet-stream",1024,"message").ok,false);
});
test("larger media budgets preserve bounded image, video and document limits",()=>{
  assert.equal(validateUpload("image.jpg","image/jpeg",50*1024*1024,"message").ok,true);
  assert.equal(validateUpload("image.jpg","image/jpeg",50*1024*1024+1,"message").ok,false);
  assert.equal(validateUpload("clip.mov","video/quicktime",250*1024*1024,"message").ok,true);
  assert.equal(validateUpload("clip.mov","video/quicktime",250*1024*1024+1,"message").ok,false);
  assert.equal(validateUpload("doc.pdf","application/pdf",11*1024*1024,"message").ok,false);
});
test("staging authorization binds owner, chat, expiry and authenticated metadata",()=>{
  const user=randomUUID(),conversation=randomUUID(),data={id:randomUUID(),user,conversation,name:"clip.mp4",mime:"video/mp4",size:40,expires:Date.now()+60000};
  const token=stageToken(data);assert.equal(readStage(token,user,conversation).size,40);
  assert.throws(()=>readStage(token,randomUUID(),conversation));assert.throws(()=>readStage(token,user,randomUUID()));
  assert.throws(()=>readStage(token+"x",user));assert.throws(()=>readStage(stageToken({...data,expires:Date.now()-1}),user));
});
test("encrypted staging rejects reordered/concurrent chunks and consumes finalized bytes once",async()=>{
  const user=randomUUID(),conversation=randomUUID();const token=await createStage({user,conversation,name:"clip.mp4",mime:"video/mp4",size:64});
  try {
    await assert.rejects(appendStage(token,randomUUID(),0,new Uint8Array(32)));
    await assert.rejects(appendStage(token,user,10,new Uint8Array(32)));
    const results=await Promise.allSettled([appendStage(token,user,0,new Uint8Array(32).fill(7)),appendStage(token,user,0,new Uint8Array(32).fill(7))]);
    assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
    assert.equal(await stageOffset(token,user),32);
    await assert.rejects(claimStage(token,user,conversation));
    await appendStage(token,user,32,new Uint8Array(32).fill(9));
    const claim=await claimStage(token,user,conversation);const bytes=new Uint8Array(await claim.file.arrayBuffer());
    assert.deepEqual([...bytes],[...new Uint8Array(32).fill(7),...new Uint8Array(32).fill(9)]);
    await assert.rejects(claimStage(token,user,conversation));await claim.finish(false);
    const retry=await claimStage(token,user,conversation);await retry.finish(true);await assert.rejects(claimStage(token,user,conversation));
  }finally{await abandonStage(token,user);}
});
