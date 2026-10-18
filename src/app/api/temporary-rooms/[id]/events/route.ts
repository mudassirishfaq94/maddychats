import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorizeTemporaryRoom,credentialHash,roomCookie,TemporaryRoomError } from "@/server/temporary-rooms";
import { temporaryRoomListener } from "@/server/temporary-room-listener";
import { guardSameOrigin,jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { resolveClientIp } from "@/server/client-ip";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const blocked=guardSameOrigin(req);if(blocked)return blocked;const {id}=await params;if(!z.uuid().safeParse(id).success)return jsonError(404,"Room unavailable.");
 const credential=req.cookies.get(roomCookie(id))?.value;if(!credential||!/^[a-f0-9]{64}$/.test(credential))return jsonError(404,"Room unavailable.");
 const ip=resolveClientIp(req.headers,{render:Boolean(process.env.RENDER),production:process.env.NODE_ENV==="production",trustedHops:process.env.TRUSTED_PROXY_HOPS});
 const ipLimit=await rateLimit(`temporary-api-ip:${credentialHash(ip)}`,240,60000);if(!ipLimit.allowed)return jsonError(429,"Too many room requests.");
 const limit=await rateLimit(`temporary-stream:${id}:${credentialHash(credential)}`,10,60000);if(!limit.allowed)return jsonError(429,"Too many room connections.");
 try{await authorizeTemporaryRoom(id,credential);}catch(error){return jsonError(error instanceof TemporaryRoomError?error.status:503,"Room unavailable or expired.");}
 let unsubscribe:(()=>void)|undefined,heartbeat:ReturnType<typeof setInterval>|undefined,expiry:ReturnType<typeof setTimeout>|undefined,closed=false;
 const encoder=new TextEncoder();let end=()=>{};
 const stream=new ReadableStream<Uint8Array>({async start(controller){
  end=()=>{if(closed)return;closed=true;if(heartbeat)clearInterval(heartbeat);if(expiry)clearTimeout(expiry);unsubscribe?.();req.signal.removeEventListener("abort",end);try{controller.close();}catch{}};
  req.signal.addEventListener("abort",end,{once:true});
  try{unsubscribe=await temporaryRoomListener.subscribe(id,connected=>{if(!connected){end();return;}if(!closed)try{controller.enqueue(encoder.encode('data: changed\n\n'));}catch{end();}});
   if(closed||req.signal.aborted){unsubscribe();end();return;}
   controller.enqueue(encoder.encode("retry: 2000\ndata: ready\n\n"));
   heartbeat=setInterval(()=>{if(!closed)try{controller.enqueue(encoder.encode(": keepalive\n\n"));}catch{end();}},15000);
   expiry=setTimeout(end,55000);
  }catch{end();}
 },cancel(){end();}});
 return new NextResponse(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"private, no-store","Connection":"keep-alive","X-Accel-Buffering":"no"}});
}
