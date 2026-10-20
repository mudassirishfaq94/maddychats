import { NextRequest, NextResponse } from "next/server";
import { guardSameOrigin, jsonError } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { processScheduledMessages } from "@/server/scheduled-messages";

export const dynamic = "force-dynamic";

/** Processes due messages while at least one authenticated ZipTalk client is active. */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  if (!(await getSessionUser())) return jsonError(401, "Not authenticated.");
  const result = await processScheduledMessages();
  return NextResponse.json({ ok: true, ...result });
}
