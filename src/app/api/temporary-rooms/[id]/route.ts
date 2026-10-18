import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { actOnTemporaryRoom,authorizeTemporaryRoom,credentialHash,readTemporaryRoom,roomCookie,TemporaryRoomError } from "@/server/temporary-rooms";
import { resolveClientIp } from "@/server/client-ip";
import { startStarterMaintenance } from "@/server/starter-maintenance";
import { reserveTemporaryTransfer } from "@/server/temporary-transfer-capacity";
import { guardSameOrigin,jsonError,readBoundedBody,requestIsSecure } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
export const dynamic="force-dynamic";
const action=z.discriminatedUnion("action",[
 z.object({action:z.literal("message"),messageId:z.uuid(),ciphertext:z.string().min(32).max(10000000).regex(/^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$/)}),
 z.object({action:z.literal("extend"),minutes:z.union([z.literal(5),z.literal(15),z.literal(30),z.literal(60)])}),
 z.object({action:z.literal("approve"),requestId:z.uuid()}),z.object({action:z.literal("reject"),requestId:z.uuid()}),z.object({action:z.literal("end")})
]);
async function handle(req:NextRequest,ctx:{params:Promise<{id:string}>},write:boolean){
 const blocked=guardSameOrigin(req);if(blocked)return blocked;const {id}=await ctx.params;if(!z.uuid().safeParse(id).success)return jsonError(404,"Room unavailable.");
 const requestedRole=req.nextUrl.searchParams.get("role");if(requestedRole&&requestedRole!=="host"&&requestedRole!=="guest")return jsonError(422,"Invalid participant role.");
 const role=requestedRole==="host"||requestedRole==="guest"?requestedRole:(req.cookies.has(roomCookie(id,"host"))?"host":"guest");const cookieName=roomCookie(id,role);
 const credential=req.cookies.get(cookieName)?.value;if(!credential||!/^[a-f0-9]{64}$/.test(credential))return jsonError(404,"Room unavailable or expired.");
 const ip=resolveClientIp(req.headers,{render:Boolean(process.env.RENDER),production:process.env.NODE_ENV==="production",trustedHops:process.env.TRUSTED_PROXY_HOPS});
 const ipLimit=await rateLimit(`temporary-api-ip:${credentialHash(ip)}`,240,60000);if(!ipLimit.allowed)return jsonError(429,"Please wait a moment and try again.");
 const limit=await rateLimit(`temporary-${write?"write":"read"}:${id}:${credentialHash(credential)}`,write?40:120,60000);if(!limit.allowed)return jsonError(429,"Please wait a moment and try again.");
 const transfer:{release:(()=>void)|null}={release:null};let streamed=false;
 const reserve=()=>{transfer.release=reserveTemporaryTransfer();if(!transfer.release)throw new TemporaryRoomError(503,"Temporary media transfers are busy. Retry shortly; your selection is preserved.");};
 try{
  startStarterMaintenance();await authorizeTemporaryRoom(id,credential);
  let result;
  if(write){const length=Number(req.headers.get("content-length"));const small=req.headers.get("x-circlo-temporary-control")==="1"||(req.headers.has("content-length")&&Number.isSafeInteger(length)&&length>=0&&length<=65536);if(!small)reserve();let body:unknown;try{body=JSON.parse(new TextDecoder().decode(await readBoundedBody(req,small?65536:10001000,small?15000:60000)));}catch(error){if(error instanceof Error&&error.message==="body_read_timeout")return jsonError(408,"The transfer timed out. Your selection is preserved; retry sending.");return jsonError(413,"The encrypted message is too large or invalid.");}
   const parsed=action.safeParse(body);if(!parsed.success)return jsonError(422,"Invalid room action.");result=await actOnTemporaryRoom(id,credential,parsed.data);
  }else{
   const at=req.nextUrl.searchParams.get("after"),cursorId=req.nextUrl.searchParams.get("cursor");let after;
   if(at||cursorId){if(!at||!cursorId||!z.iso.datetime({offset:true}).safeParse(at).success||!z.uuid().safeParse(cursorId).success)return jsonError(422,"Invalid message cursor.");after={at,id:cursorId};}
   result=await readTemporaryRoom(id,credential,after,bytes=>{if(bytes>524288)reserve();});
  }
  const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
  if(transfer.release&&!write){const bytes=new TextEncoder().encode(JSON.stringify(result));let offset=0;const releaseTransfer=transfer.release;const stream=new ReadableStream<Uint8Array>({pull(controller){if(offset>=bytes.length){controller.close();releaseTransfer();return;}const end=Math.min(offset+65536,bytes.length);controller.enqueue(bytes.subarray(offset,end));offset=end;},cancel(){releaseTransfer();}});streamed=true;return new NextResponse(stream,{headers:{...headers,"Content-Type":"application/json","Content-Length":String(bytes.length)}});}
  const res=NextResponse.json(result,{headers});
  if("ended" in result)res.cookies.set(cookieName,"",{path:`/api/temporary-rooms/${id}`,httpOnly:true,secure:requestIsSecure(req),sameSite:"strict",maxAge:0});return res;
 }catch(error){if(error instanceof TemporaryRoomError){const response=jsonError(error.status,error.message);if(error.status===410||error.status===404)response.cookies.set(cookieName,"",{path:`/api/temporary-rooms/${id}`,httpOnly:true,secure:requestIsSecure(req),sameSite:"strict",maxAge:0});if(error.status===503)response.headers.set("Retry-After","2");return response;}return jsonError(503,"Room temporarily unavailable. Your message was not confirmed; retry safely.");}finally{if(!streamed)transfer.release?.();}
}
export function GET(req:NextRequest,ctx:{params:Promise<{id:string}>}){return handle(req,ctx,false);}
export function POST(req:NextRequest,ctx:{params:Promise<{id:string}>}){return handle(req,ctx,true);}
