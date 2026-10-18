import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PRIVATE_PART_BYTES,writePrivateParts,readPrivateParts,privatePartPaths } from "../src/server/private-media-parts";
test("private parts reassemble the exact ciphertext without exposing other object paths",async()=>{
  const objects=new Map<string,Blob>();const bytes=new Uint8Array(PRIVATE_PART_BYTES+1024).fill(97);bytes[PRIVATE_PART_BYTES]=12;
  const root=await writePrivateParts("files/isolated-cipher",new Blob([bytes]),async(path,body)=>{assert(body.size<=PRIVATE_PART_BYTES);objects.set(path,body);},async()=>{});
  const get=async(path:string)=>{const object=objects.get(path);return object?{body:object.stream(),size:object.size}:null;};
  const result=await readPrivateParts(root,get);assert(result);assert.equal(result.size,bytes.length);
  const streamed=await new Response(result.body as ReadableStream<Uint8Array<ArrayBuffer>>).arrayBuffer();
  assert.equal(createHash("sha256").update(new Uint8Array(streamed)).digest("hex"),createHash("sha256").update(bytes).digest("hex"));
  const manifest=JSON.parse(await objects.get(root)!.text());manifest.parts[0].path="files/another-persons-file";objects.set(root,new Blob([JSON.stringify(manifest)]));
  await assert.rejects(readPrivateParts(root,get));assert.throws(()=>privatePartPaths("files/../unsafe.parts"));
});
test("failed segmented writes clean up only newly owned objects; missing parts fail closed",async()=>{
  const removed:string[]=[];
  await assert.rejects(writePrivateParts("files/failed-cipher",new Blob([new Uint8Array(PRIVATE_PART_BYTES+1)]),async(path)=>{if(path.endsWith('.1'))throw new Error('provider failure');},async(paths)=>{removed.push(...paths);}));
  assert.deepEqual(removed,["files/failed-cipher.parts","files/failed-cipher.parts.0","files/failed-cipher.parts.1"]);
  const manifest=new Blob([JSON.stringify({version:"circlo-cipher-parts-v1",size:32,parts:[{path:"files/missing.parts.0",size:32}]})]);
  const streamed=await readPrivateParts("files/missing.parts",async(path)=>path.endsWith('.parts')?{body:manifest.stream(),size:manifest.size}:null);
  await assert.rejects(new Response(streamed!.body as ReadableStream<Uint8Array<ArrayBuffer>>).arrayBuffer());
});
