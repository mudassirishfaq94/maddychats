import { createHash, randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notificationPreferences, oauthAccounts, users } from "@/db/schema";
import { phoneAuthExchangeSchema } from "@/lib/schemas";
import { SESSION_COOKIE } from "@/server/config";
import { verifyFirebaseIdToken } from "@/server/firebase-admin";
import { clientIp, guardSameOrigin, jsonError, readJson, requestIsSecure } from "@/server/http";
import { hashPassword } from "@/server/password";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import { createSessionToken, sessionCookieOptions } from "@/server/session";
import { toSafeUser } from "@/server/users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROVIDER = "firebase_phone";

async function findPhoneUser(firebaseUid: string) {
  const rows = await db
    .select({ user: users })
    .from(oauthAccounts)
    .innerJoin(users, eq(oauthAccounts.userId, users.id))
    .where(and(
      eq(oauthAccounts.provider, PROVIDER),
      eq(oauthAccounts.providerAccountId, firebaseUid),
    ))
    .limit(1);
  return rows[0]?.user ?? null;
}

async function provisionPhoneUser(firebaseUid: string) {
  const identityHash = createHash("sha256").update(firebaseUid).digest("hex");
  const base = `maddy${identityHash.slice(0, 8)}`;
  let username = base;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
    if (!existing[0]) break;
    username = `${base.slice(0, 13)}${randomBytes(3).toString("hex")}`;
  }

  const internalId = identityHash.slice(0, 24);
  const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
  return db.transaction(async (tx) => {
    const created = await tx.insert(users).values({
      displayName: "Maddy User",
      username,
      email: `phone-${internalId}@auth.maddychats.invalid`,
      passwordHash,
    }).returning();
    await tx.insert(notificationPreferences).values({ userId: created[0].id });
    await tx.insert(oauthAccounts).values({
      userId: created[0].id,
      provider: PROVIDER,
      providerAccountId: firebaseUid,
    });
    return created[0];
  });
}

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const rl = rateLimit(`phone-exchange:${clientIp(req)}`, AUTH_RATE_LIMIT.limit, AUTH_RATE_LIMIT.windowMs);
  if (!rl.allowed) return jsonError(429, "Too many attempts. Please try again later.");

  const body = await readJson(req);
  const parsed = phoneAuthExchangeSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid phone authentication request.");

  let identity;
  try {
    identity = await verifyFirebaseIdToken(parsed.data.idToken);
    if (
      !identity.phoneNumber ||
      identity.decodedToken.firebase.sign_in_provider !== "phone"
    ) {
      return jsonError(401, "A verified Firebase phone identity is required.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("not configured")) {
      return jsonError(503, "Phone sign-in is not configured yet.");
    }
    return jsonError(401, "Phone verification is invalid or has expired.");
  }
  let user = await findPhoneUser(identity.uid);
  if (!user) {
    try {
      user = await provisionPhoneUser(identity.uid);
    } catch {
      // A simultaneous request may have created the provider mapping first.
      user = await findPhoneUser(identity.uid);
      if (!user) return jsonError(500, "Could not create your Maddy Chats account.");
    }
  }

  const response = NextResponse.json({ user: toSafeUser(user) });
  response.cookies.set(
    SESSION_COOKIE,
    await createSessionToken(user.id, user.username),
    sessionCookieOptions(requestIsSecure(req)),
  );
  return response;
}
