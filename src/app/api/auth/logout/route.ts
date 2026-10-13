import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, deviceSessions } from "@/db/schema";
import { guardSameOrigin, requestIsSecure } from "@/server/http";
import { SESSION_COOKIE, REFRESH_COOKIE } from "@/server/config";
import { getSessionDeviceId, getSessionUser, sessionCookieOptions } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * Sign out this browser server-side, including copies of its access/refresh
 * tokens. Other browsers keep their sessions and encryption approval.
 */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const me = await getSessionUser();
  if (me) {
    const sessionId = await getSessionDeviceId();
    if (sessionId) {
      await db.update(deviceSessions).set({ revokedAt: new Date() }).where(and(eq(deviceSessions.userId, me.id), eq(deviceSessions.id, sessionId)));
    } else {
      // Legacy cookies have no individually revocable session. Retain their
      // account-wide cutoff until these pre-session cookies finish expiring.
      await db.update(users).set({ tokenInvalidBeforeAt: new Date() }).where(eq(users.id, me.id));
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(requestIsSecure(req)),
    maxAge: 0,
  });
  res.cookies.set(REFRESH_COOKIE, "", { ...sessionCookieOptions(requestIsSecure(req)), maxAge: 0 });
  return res;
}
