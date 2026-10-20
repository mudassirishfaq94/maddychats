import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { openAsBlob } from "node:fs";
import { mkdir, open, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { jwtSecret } from "./config";
import { ENCRYPTED_MEDIA_OVERHEAD, MEDIA_CHUNK_BYTES, MEDIA_MAX_BYTES } from "@/lib/media-limits";

type Stage = { id:string; user:string; conversation:string; name:string; mime:string; size:number; expires:number };
const root = () => path.join(process.cwd(), "server", "staged-media");
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const sign = (body:string) => createHmac("sha256", jwtSecret()).update(`encrypted-media-stage:${body}`).digest("base64url");
export function stageToken(data:Stage):string {const body=Buffer.from(JSON.stringify(data)).toString("base64url");return `${body}.${sign(body)}`;}
export function readStage(token:string,user:string,conversation?:string):Stage {
  if(token.length>4096)throw new Error("Invalid upload session.");
  const [body,signature,extra]=token.split(".");const expected=sign(body??"");
  if(extra||!signature||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))throw new Error("Invalid upload session.");
  const value=JSON.parse(Buffer.from(body,"base64url").toString()) as Stage;
  if(!uuid.test(value.id)||value.user!==user||(conversation&&value.conversation!==conversation)||value.expires<=Date.now()||!Number.isSafeInteger(value.size)||value.size<29||value.size>MEDIA_MAX_BYTES+ENCRYPTED_MEDIA_OVERHEAD)throw new Error("Upload expired or belongs to another chat.");
  return value;
}
const filePath=(id:string,suffix="cipher")=>{if(!uuid.test(id))throw new Error("Invalid upload.");return path.join(root(),`${id}.${suffix}`);};
/** Bounded encrypted temporary inventory, including abandoned sessions after restart. */
async function inventory(extra=0) {
  await mkdir(root(),{recursive:true,mode:0o700});let bytes=0,active=0;
  const names=await readdir(root());
  for(const name of names) {
    if(!/^[a-f\d-]{36}\.(cipher|claim|lock)$/.test(name))continue;
    const file=path.join(root(),name),info=await stat(file).catch(()=>null);if(!info)continue;
    if(Date.now()-info.mtimeMs>(name.endsWith('.lock')?60000:2*60*60*1000)){await unlink(file).catch(()=>{});continue;}
    if(!name.endsWith('.lock')){bytes+=info.size;active++;}
  }
  if(bytes+extra>512*1024*1024)throw new Error("Upload storage is busy. Try later.");
  return active;
}
export async function createStage(data:Omit<Stage,"id"|"expires">) {
  if(await inventory()>=128)throw new Error("Upload storage is busy. Try later.");const stage={...data,id:randomUUID(),expires:Date.now()+60*60*1000};
  const file=await open(filePath(stage.id),"wx",0o600);await file.close();return stageToken(stage);
}
export async function appendStage(token:string,user:string,offset:number,bytes:Uint8Array) {
  const stage=readStage(token,user);
  if(!Number.isSafeInteger(offset)||offset<0||bytes.length<1||bytes.length>MEDIA_CHUNK_BYTES||offset+bytes.length>stage.size)throw new Error("Invalid upload chunk.");
  // Filesystem lock works across worker processes and is never a path supplied by a client.
  const lockPath=filePath(stage.id,"lock");
  const stale=await stat(lockPath).catch(()=>null);if(stale&&Date.now()-stale.mtimeMs>60000)await unlink(lockPath).catch(()=>{});
  const lock=await open(lockPath,"wx",0o600);
  try {
    const info=await stat(filePath(stage.id));
    if(info.size!==offset)throw new Error("Upload offset changed. Retry this selection.");
    await inventory(bytes.length);
    const file=await open(filePath(stage.id),"r+");try{let written=0;while(written<bytes.length){const part=await file.write(bytes,written,bytes.length-written,offset+written);if(!part.bytesWritten)throw new Error("Upload write failed.");written+=part.bytesWritten;}}finally{await file.close();}
  }finally{await lock.close();await unlink(lockPath).catch(()=>{});}
  return offset+bytes.length;
}
export type StageClaim={file:File;mime:string;finish:(committed:boolean)=>Promise<void>};
export async function stageOffset(token:string,user:string) {return (await stat(filePath(readStage(token,user).id))).size;}
export async function abandonStage(token:string,user:string) {await unlink(filePath(readStage(token,user).id)).catch(()=>{});}
export async function cleanupStagedMedia() {await inventory().catch(()=>{});}
export async function claimStage(token:string,user:string,conversation:string):Promise<StageClaim> {
  const stage=readStage(token,user,conversation);
  const lock=await open(filePath(stage.id,"lock"),"wx",0o600);
  try {
    if((await stat(filePath(stage.id))).size!==stage.size)throw new Error("Upload is incomplete.");
    await rename(filePath(stage.id),filePath(stage.id,"claim"));
  }finally{await lock.close();await unlink(filePath(stage.id,"lock")).catch(()=>{});}
  const blob=await openAsBlob(filePath(stage.id,"claim"));
  return {file:new File([blob],stage.name,{type:"application/octet-stream"}),mime:stage.mime,finish:async(committed)=>{
    if(committed)await unlink(filePath(stage.id,"claim")).catch(()=>{});
    else await rename(filePath(stage.id,"claim"),filePath(stage.id)).catch(()=>{});
  }};
}
