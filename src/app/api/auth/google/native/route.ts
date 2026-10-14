import { withPasswordCapacity } from "@/server/password-capacity";
import { rateLimit } from "@/server/rate-limit";
import { beginSignIn } from "@/server/authentication";
import { randomBytes } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notificationPreferences, oauthAccounts, users } from "@/db/schema";
import { hashPassword } from "@/server/password";
import { jsonError, readJson, guardSameOrigin, clientIp } from "@/server/http";
import { verifyGoogleMobileHandoff } from "@/server/google-mobile-handoff";
import { findUserById } from "@/server/users";
import { createHash, timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/**
 * Native Google Identity exchange. Android Credential Manager supplies a
 * Google ID token; this endpoint verifies it server-side and issues the same
 * HttpOnly ZipTalk session cookie as the web OAuth callback.
 */
async function handlePOST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  if (!(await rateLimit(`google-native:${clientIp(req)}`, 25, 10 * 60 * 1000)).allowed) return jsonError(429, "Too many sign-in attempts.");
  const body = await readJson(req) as { idToken?: unknown } | null;
  const ticket = typeof (body as { ticket?: unknown } | null)?.ticket === "string" ? (body as { ticket: string }).ticket : null;
  const verifier = typeof (body as { verifier?: unknown } | null)?.verifier === "string" ? (body as { verifier: string }).verifier : null;
  if (ticket && verifier) {
    const handoff = await verifyGoogleMobileHandoff(ticket);
    const actual = createHash("sha256").update(verifier).digest("base64url");
    if (!handoff || actual.length !== handoff.codeChallenge.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(handoff.codeChallenge))) {
      return jsonError(401, "Google mobile sign-in could not be verified.");
    }
    const user = await findUserById(handoff.userId);
    if (!user || user.username !== handoff.username) return jsonError(401, "Google mobile sign-in expired.");
    // PKCE proves possession, but does not make a captured ticket/verifier
    // pair single-use. Consume it atomically in the shared store before auth.
    const ticketId = createHash("sha256").update(ticket).digest("hex");
    if (!(await rateLimit(`google-mobile-handoff:${ticketId}`, 1, 5 * 60 * 1000)).allowed) return jsonError(409, "Google mobile sign-in was already used or could not be verified. Start sign-in again.");
    return beginSignIn(req, user);
  }
  const idToken = typeof body?.idToken === "string" ? body.idToken : null;
  if (!idToken) return jsonError(422, "Google ID token is required.");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return jsonError(503, "Google sign-in is not configured.");

  let claims;
  try {
    ({ payload: claims } = await jwtVerify(idToken, googleKeys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    }));
  } catch {
    return jsonError(401, "Google could not verify this sign-in.");
  }
  if (typeof claims.iat !== "number" || claims.iat * 1000 < Date.now() - 5 * 60 * 1000 || claims.iat * 1000 > Date.now() + 30_000) return jsonError(401, "Request a fresh Google sign-in credential.");
  if (!claims.sub || typeof claims.email !== "string" || claims.email_verified !== true) {
    return jsonError(401, "Google account email is not verified.");
  }

  let user = (await db.select({ user: users }).from(oauthAccounts)
    .innerJoin(users, eq(oauthAccounts.userId, users.id))
    .where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerAccountId, claims.sub))).limit(1))[0]?.user;

  if (!user) {
    const [emailOwner] = await db.select().from(users)
      .where(sql`lower(${users.email}) = ${claims.email.toLowerCase()}`).limit(1);
    if (emailOwner) {
      return jsonError(409, "An account already uses this email. Sign in with its existing method, then link Google from profile settings.");
    }
  }
  if (!user) {
    const base = claims.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 14) || "ziptalk";
    let username = base;
    for (let i = 0; i < 20; i++) {
      const [taken] = await db.select({ id: users.id }).from(users)
        .where(sql`lower(${users.username}) = ${username.toLowerCase()}`).limit(1);
      if (!taken) break;
      username = `${base.slice(0, 14)}${randomBytes(3).toString("hex")}`;
    }
    const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
    user = await db.transaction(async (tx) => {
      const [created] = await tx.insert(users).values({
        displayName: typeof claims.name === "string" ? claims.name.slice(0, 50) : username,
        username, email: claims.email!.toLowerCase(), emailVerifiedAt: new Date(),
        passwordHash,
        avatarUrl: typeof claims.picture === "string" ? claims.picture : null,
      }).returning();
      await tx.insert(notificationPreferences).values({ userId: created.id });
      await tx.insert(oauthAccounts).values({ userId: created.id, provider: "google", providerAccountId: claims.sub! });
      return created;
    });
  }

  if (!user.emailVerifiedAt && user.email.toLowerCase() === claims.email.toLowerCase()) {
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
  }
  return beginSignIn(req, user);
}

/** The web OAuth client id is public and required by Android Credential Manager. */
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return jsonError(503, "Google sign-in is not configured.");
  return NextResponse.json({ clientId });
}

export const POST = withPasswordCapacity(handlePOST);
