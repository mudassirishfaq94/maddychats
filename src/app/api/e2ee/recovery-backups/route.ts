import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDeviceSetupUser, getSessionUser, getSessionDeviceId } from "@/server/session";
import { guardSameOrigin, jsonError, readBoundedBody } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { listRecoveryBackups, readRecoveryBackup, saveRecoveryBackup } from "@/server/recovery-backups";
const base64 = /^[a-zA-Z0-9_-]+$/;
const input = z.object({ id:z.string().uuid(),deviceId:z.string().min(1).max(100),revision:z.number().int().min(0),confirmed:z.boolean(),
  envelope:z.object({ format:z.literal("circlo-cloud-recovery-v1"),kdf:z.literal("HKDF-SHA-256"),salt:z.string().length(43).regex(base64),iv:z.string().length(16).regex(base64),ciphertext:z.string().min(32).max(12*1024*1024).regex(base64) }).strict() }).strict();
const headers = { "Cache-Control":"private, no-store" };
export async function GET(req: NextRequest) {
  const blocked=guardSameOrigin(req); if(blocked) return blocked;
  // Primary login may retrieve only the owner's opaque envelope. The code still decrypts it solely on-device.
  const user=await getDeviceSetupUser(); if(!user) return jsonError(401,"Sign in before restoring a backup.");
  if(!(await rateLimit(`recovery-read:${user.id}`,30,60000)).allowed) return jsonError(429,"Please wait before trying recovery again.");
  const id=req.nextUrl.searchParams.get("id");
  if(id) {
    if(!z.string().uuid().safeParse(id).success) return jsonError(422,"Invalid backup.");
    const backup=await readRecoveryBackup(user.id,id);
    return backup ? NextResponse.json({ backup },{headers}) : jsonError(404,"Backup unavailable.");
  }
  return NextResponse.json({ backups:await listRecoveryBackups(user.id) },{headers});
}
export async function PUT(req: NextRequest) {
  const blocked=guardSameOrigin(req); if(blocked) return blocked;
  const user=await getSessionUser(), session=await getSessionDeviceId();
  if(!user || !session) return jsonError(403,"Use a trusted signed-in device to update recovery.");
  if(!(await rateLimit(`recovery-write:${user.id}`,12,60000)).allowed) return jsonError(429,"Please wait before backing up again.");
  let body: unknown;
  try { body=JSON.parse(new TextDecoder().decode(await readBoundedBody(req,12*1024*1024,15000))); } catch { return jsonError(413,"Backup is invalid or too large."); }
  const parsed=input.safeParse(body); if(!parsed.success) return jsonError(422,"Invalid encrypted backup.");
  const saved=await saveRecoveryBackup(user.id,session,parsed.data);
  if(!saved) return jsonError(409,"Device approval or backup version changed. Refresh recovery before retrying.");
  return NextResponse.json(saved,{headers});
}
