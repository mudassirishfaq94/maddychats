import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, guardUploadSize, jsonError, readBoundedBody, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { getConversationForUser, isBlockedBetween, memberIdsOf } from "@/server/chat";
import { createStage, appendStage, stageOffset } from "@/server/staged-media";
import { validateUpload } from "@/server/storage";
import { normalizeMediaType } from "@/lib/media-types";
import { MEDIA_CHUNK_BYTES } from "@/lib/media-limits";
export const runtime="nodejs";
export async function GET(req:NextRequest) {
  const blocked=guardSameOrigin(req);if(blocked)return blocked;
  const user=await getSessionUser();if(!user)return jsonError(401,"Not authenticated.");
  if(!(await rateLimit(`media-offset:${user.id}`,120,60000)).allowed)return jsonError(429,"Try again shortly.");
  try{return NextResponse.json({offset:await stageOffset(req.headers.get("X-Upload-Token")??"",user.id)},{headers:{"Cache-Control":"private, no-store"}});}catch{return jsonError(404,"Upload session unavailable.");}
}
export async function POST(req:NextRequest) {
  const blocked=guardSameOrigin(req)??guardUploadSize(req,true);if(blocked)return blocked;
  const user=await getSessionUser();if(!user)return jsonError(401,"Not authenticated.");
  if(!(await rateLimit(`media-stage:${user.id}`,10,60000)).allowed)return jsonError(429,"Too many uploads. Try again shortly.");
  const body=await readJson(req);
  if(!body||body.encrypted!==true||typeof body.conversationId!=="string"||typeof body.name!=="string"||typeof body.mime!=="string"||typeof body.size!=="number"||!Number.isSafeInteger(body.size)||body.name.length>255)return jsonError(422,"Encrypted upload metadata required.");
  const conversation=await getConversationForUser(body.conversationId,user.id);
  if(!conversation)return jsonError(404,"Conversation not found.");
  if(conversation.requestPending||conversation.awaitingApproval)return jsonError(403,"Wait for this message request to be accepted before sharing media.");
  if(conversation.adminOnlyMessaging&&!['owner','admin'].includes(conversation.myRole))return jsonError(403,"Only admins can send messages.");
  for(const member of await memberIdsOf(body.conversationId))if(member!==user.id&&await isBlockedBetween(user.id,member))return jsonError(403,"You cannot send messages in this conversation.");
  const mime=normalizeMediaType(body.name,body.mime);
  const check=validateUpload(body.name,mime,body.size-28,"message");if(!check.ok)return jsonError(422,check.error);
  try {return NextResponse.json({token:await createStage({user:user.id,conversation:body.conversationId,name:check.safeName,mime,size:body.size})},{headers:{"Cache-Control":"private, no-store"}});}
  catch{return jsonError(503,"Upload storage is busy. Try again shortly.");}
}
export async function PUT(req:NextRequest) {
  const blocked=guardSameOrigin(req)??guardUploadSize(req,true);if(blocked)return blocked;
  const user=await getSessionUser();if(!user)return jsonError(401,"Not authenticated.");
  if(!(await rateLimit(`media-chunk:${user.id}`,120,60000)).allowed)return jsonError(429,"Upload is temporarily busy. Retry shortly.");
  try {
    const offset=Number(req.headers.get("X-Upload-Offset"));
    if(!req.headers.has("X-Upload-Offset"))return jsonError(422,"Upload offset required.");
    const bytes=await readBoundedBody(req,MEDIA_CHUNK_BYTES,60000);
    const next=await appendStage(req.headers.get("X-Upload-Token")??"",user.id,offset,bytes);
    return NextResponse.json({offset:next},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return jsonError(409,"Upload interrupted, expired or out of order. Your selection is preserved; retry sending.");}
}
