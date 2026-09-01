import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { jsonError } from "@/server/http";
import { listStarredMessages } from "@/server/chat";

export const dynamic = "force-dynamic";

/** List all starred messages for the authenticated user. */
export async function GET(_req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const starred = await listStarredMessages(me.id);
  return NextResponse.json({ starred });
}
