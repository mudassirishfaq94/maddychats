import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, deviceSessions } from "@/db/schema";
import { guardSameOrigin, requestIsSecure } from "@/server/http";
import { SESSION_COOKIE, REFRESH_COOKIE } from "@/server/config";
import { getSessionUser, sessionCookieOptions } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * Sign out: clears the cookie AND revokes every outstanding token for the
 * account server-side, so a stolen/copied cookie cannot outlive the logout.
 */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const me = await getSessionUser();
  if (me) {
    await db.transaction(async (tx) => {
      const now = new Date();
      await tx.update(users).set({ tokenInvalidBeforeAt: now }).where(eq(users.id, me.id));
      await tx.update(deviceSessions).set({ revokedAt: now }).where(eq(deviceSessions.userId, me.id));
    });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(requestIsSecure(req)),
    maxAge: 0,
  });
  res.cookies.set(REFRESH_COOKIE, "", { ...sessionCookieOptions(requestIsSecure(req)), maxAge: 0 });
  return res;
}
