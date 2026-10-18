import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { createTemporaryRoom,joinTemporaryRoom,roomCookie,TemporaryRoomError } from "@/server/temporary-rooms";
import { guardSameOrigin,jsonError,readJson,requestIsSecure } from "@/server/http";
import { resolveClientIp } from "@/server/client-ip";
import { rateLimit } from "@/server/rate-limit";
import { startStarterMaintenance } from "@/server/starter-maintenance";
export const dynamic="force-dynamic";
const common={inviteHash:z.string().regex(/^[a-f0-9]{64}$/),publicKey:z.string().min(80).max(200),credential:z.string().regex(/^[a-f0-9]{64}$/)};
const create=z.object({action:z.literal("create"),id:z.uuid(),...common,minutes:z.union([z.literal(5),z.literal(15),z.literal(30),z.literal(60)]).default(30)});
const join=z.object({action:z.literal("join"),...common});
export async function POST(req:NextRequest){const blocked=guardSameOrigin(req);if(blocked)return blocked;
 const ip=resolveClientIp(req.headers,{render:Boolean(process.env.RENDER),production:process.env.NODE_ENV==="production",trustedHops:process.env.TRUSTED_PROXY_HOPS});
 const limit=await rateLimit(`temporary-entry:${createHash("sha256").update(ip).digest("hex")}`,20,600000);if(!limit.allowed)return jsonError(429,"Too many attempts. Please wait before trying again.");
 const parsed=z.discriminatedUnion("action",[create,join]).safeParse(await readJson(req));if(!parsed.success)return jsonError(422,"Check the room code and try again.");
 try{startStarterMaintenance();const input=parsed.data;const room=input.action==="create"?await createTemporaryRoom(input):await joinTemporaryRoom(input);
  const res=NextResponse.json(room,{headers:{"Cache-Control":"private, no-store"}});res.cookies.set(roomCookie(room.id,room.role),input.credential,{httpOnly:true,secure:requestIsSecure(req),sameSite:"strict",path:`/api/temporary-rooms/${room.id}`,maxAge:86400});return res;
 }catch(error){if(error instanceof TemporaryRoomError)return jsonError(error.status,error.message);return jsonError(503,"Temporary rooms are unavailable. Please retry.");}
}
