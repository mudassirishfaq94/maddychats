import { MEDIA_MAX_BYTES, ENCRYPTED_MEDIA_OVERHEAD } from "@/lib/media-limits";
import { readBoundedBody } from "./http";
export const PRIVATE_PART_BYTES=8*1024*1024;
const MAX_PARTS=Math.ceil((MEDIA_MAX_BYTES+ENCRYPTED_MEDIA_OVERHEAD)/PRIVATE_PART_BYTES);
type Part={path:string;size:number};
type ObjectBody={body:ReadableStream<Uint8Array>;size:number|null};
type ReadObject=(path:string,signal?:AbortSignal)=>Promise<ObjectBody|null>;
const valid=(value:string)=>/^(images|files)\/[a-zA-Z0-9.-]+$/.test(value)&&!value.includes("..");
export function privatePartPaths(manifest:string) {if(!valid(manifest)||!manifest.endsWith(".parts"))throw new Error("Invalid private media manifest.");return [manifest,...Array.from({length:MAX_PARTS},(_,index)=>`${manifest}.${index}`)];}
/** Segmentation preserves the exact AES-GCM ciphertext; no keys or plaintext enter this layer. */
export async function writePrivateParts(base:string,file:Blob,put:(path:string,body:Blob)=>Promise<void>,remove:(paths:string[])=>Promise<void>):Promise<string> {
  const manifest=`${base}.parts`;privatePartPaths(manifest);
  if(file.size<29||file.size>MEDIA_MAX_BYTES+ENCRYPTED_MEDIA_OVERHEAD)throw new Error("Invalid encrypted media size.");
  const parts:Part[]=[];
  try {
    for(let offset=0;offset<file.size;offset+=PRIVATE_PART_BYTES){const part={path:`${manifest}.${parts.length}`,size:Math.min(PRIVATE_PART_BYTES,file.size-offset)};parts.push(part);await put(part.path,file.slice(offset,offset+part.size));}
    await put(manifest,new Blob([JSON.stringify({version:"circlo-cipher-parts-v1",size:file.size,parts})],{type:"application/octet-stream"}));
    return manifest;
  }catch(error){await remove([manifest,...parts.map(part=>part.path)]).catch(()=>{});throw error;}
}
export async function readPrivateParts(manifest:string,get:ReadObject):Promise<ObjectBody|null> {
  privatePartPaths(manifest);const header=await get(manifest);if(!header)return null;
  const bytes=await readBoundedBody(header,65536);
  const data=JSON.parse(new TextDecoder().decode(bytes)) as {version?:string;size?:number;parts?:Part[]};
  if(data.version!=="circlo-cipher-parts-v1"||!Number.isSafeInteger(data.size)||data.size!<29||data.size!>MEDIA_MAX_BYTES+ENCRYPTED_MEDIA_OVERHEAD||!Array.isArray(data.parts)||!data.parts.length||data.parts.length>MAX_PARTS)throw new Error("Invalid private media manifest.");
  let total=0;
  for(let index=0;index<data.parts.length;index++){const part=data.parts[index];if(part.path!==`${manifest}.${index}`||part.size!==Math.min(PRIVATE_PART_BYTES,data.size!-total)||part.size<1)throw new Error("Invalid private media part.");total+=part.size;}
  if(total!==data.size)throw new Error("Incomplete private media manifest.");
  const parts=data.parts,abort=new AbortController();let index=0,received=0,reader:ReadableStreamDefaultReader<Uint8Array>|null=null;
  return {size:total,body:new ReadableStream<Uint8Array>({
    async pull(controller){
      try {
        while(index<parts.length){
          if(!reader){const object=await get(parts[index].path,abort.signal);if(!object)throw new Error("Encrypted media part unavailable.");if(object.size!==null&&object.size!==parts[index].size){await object.body.cancel();throw new Error("Encrypted media part size changed.");}reader=object.body.getReader();received=0;}
          const chunk=await reader.read();
          if(chunk.done){reader.releaseLock();reader=null;if(received!==parts[index].size)throw new Error("Encrypted media part is incomplete.");index++;continue;}
          received+=chunk.value.length;if(received>parts[index].size)throw new Error("Encrypted media part exceeded its size.");controller.enqueue(chunk.value);return;
        }
        controller.close();
      }catch(error){await reader?.cancel().catch(()=>{});abort.abort();controller.error(error);}
    },
    async cancel(){abort.abort();await reader?.cancel().catch(()=>{});}
  })};
}
