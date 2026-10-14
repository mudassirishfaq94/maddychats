import { safeError } from "@/server/safe-error";
import { withPasswordCapacity } from "@/server/password-capacity";
import { beginSignIn } from "@/server/authentication";
import { randomBytes } from "crypto";
import { policyAcceptance } from "@/lib/policy-consent";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { notificationPreferences, oauthAccounts, users } from "@/db/schema";
import { hashPassword } from "@/server/password";
import { passwordBusyResponse } from "@/server/password-capacity";
import { getFirebaseAdmin } from "@/server/firebase-admin";
import { findUserByUsername } from "@/server/users";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import { clientIp, guardSameOrigin, jsonError, readJson } from "@/server/http";

const phoneAuthSchema = z.object({
  idToken: z.string().min(100).max(16_384),
  displayName: z.string().trim().min(2).max(50).optional(),
  username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,20}$/).optional(),
});

export const dynamic = "force-dynamic";

async function handlePOST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  if (process.env.STARTER_MODE === "1") return jsonError(503, "Phone sign-in is paused. Continue with Google or your verified email account.");
  const rl = await rateLimit(`phone-auth:${clientIp(req)}`, AUTH_RATE_LIMIT.limit, AUTH_RATE_LIMIT.windowMs);
  if (!rl.allowed) return jsonError(429, "Too many attempts. Please try again later.");

  const body = await readJson(req);
  const parsed = phoneAuthSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid phone sign-in request.");

  const admin = await getFirebaseAdmin();
  if (!admin) return jsonError(503, "Phone sign-in is not configured on this server.");

  let decoded: { uid: string; phone_number?: string; auth_time?: number };
  try {
    decoded = await admin.auth().verifyIdToken(parsed.data.idToken, true);
  } catch {
    return jsonError(401, "Your phone verification expired. Please request a new code.");
  }
  if (typeof decoded.auth_time !== "number" || decoded.auth_time * 1000 < Date.now() - 5 * 60 * 1000 || decoded.auth_time * 1000 > Date.now() + 30_000) return jsonError(401, "Request a fresh phone verification code.");
  if (!decoded.phone_number) return jsonError(401, "This Firebase credential has no verified phone number.");

  let user = (await db.select({ user: users }).from(oauthAccounts)
    .innerJoin(users, eq(oauthAccounts.userId, users.id))
    .where(and(eq(oauthAccounts.provider, "firebase_phone"), eq(oauthAccounts.providerAccountId, decoded.uid)))
    .limit(1))[0]?.user;

  if (!user) {
    const { displayName, username } = parsed.data;
    if (!displayName || !username) {
      return NextResponse.json({ needsProfile: true }, { status: 409 });
    }
    const acceptance = policyAcceptance(body);
    if (!acceptance) return jsonError(422, "Agree to the Terms and Conditions and Privacy Policy first.");
    if (await findUserByUsername(username)) {
      return jsonError(409, "This username is taken.", { username: "This username is taken" });
    }

    // Local users require an email/password. Phone-only accounts use a private,
    // non-deliverable placeholder; Firebase remains the credential authority.
    const placeholderEmail = `phone-${decoded.uid}@auth.maddychats.invalid`;
    try {
      const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
      user = await db.transaction(async (tx) => {
        const created = await tx.insert(users).values({
          displayName,
          username,
          email: placeholderEmail,
          passwordHash,
          ...acceptance,
        }).returning();
        await tx.insert(notificationPreferences).values({ userId: created[0].id });
        await tx.insert(oauthAccounts).values({
          userId: created[0].id,
          provider: "firebase_phone",
          providerAccountId: decoded.uid,
        });
        return created[0];
      });
    } catch (error) {
      const busy = passwordBusyResponse(error); if (busy) return busy;
      const code = (error as { code?: string }).code;
      if (code === "23505") return jsonError(409, "This username is taken.", { username: "This username is taken" });
      console.error("[auth] phone account creation failed:", safeError(error));
      return jsonError(500, "Could not create your account. Please try again.");
    }
  }

  return beginSignIn(req, user);
}

export const POST = withPasswordCapacity(handlePOST);
