import { randomBytes } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notificationPreferences, oauthAccounts, users } from "@/db/schema";
import { SESSION_COOKIE } from "@/server/config";
import { hashPassword } from "@/server/password";
import { createSessionToken, sessionCookieOptions } from "@/server/session";
import { jsonError, readJson, requestIsSecure } from "@/server/http";
import { toSafeUser } from "@/server/users";

export const dynamic = "force-dynamic";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/**
 * Native Google Identity exchange. Android Credential Manager supplies a
 * Google ID token; this endpoint verifies it server-side and issues the same
 * HttpOnly ZipTalk session cookie as the web OAuth callback.
 */
export async function POST(req: NextRequest) {
  const body = await readJson(req) as { idToken?: unknown } | null;
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
      await db.insert(oauthAccounts).values({ userId: emailOwner.id, provider: "google", providerAccountId: claims.sub }).onConflictDoNothing();
      user = emailOwner;
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
    user = await db.transaction(async (tx) => {
      const [created] = await tx.insert(users).values({
        displayName: typeof claims.name === "string" ? claims.name.slice(0, 50) : username,
        username, email: claims.email!.toLowerCase(),
        passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
        avatarUrl: typeof claims.picture === "string" ? claims.picture : null,
      }).returning();
      await tx.insert(notificationPreferences).values({ userId: created.id });
      await tx.insert(oauthAccounts).values({ userId: created.id, provider: "google", providerAccountId: claims.sub! });
      return created;
    });
  }

  const response = NextResponse.json({ user: toSafeUser(user) });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(user.id, user.username), sessionCookieOptions(requestIsSecure(req)));
  return response;
}

/** The web OAuth client id is public and required by Android Credential Manager. */
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return jsonError(503, "Google sign-in is not configured.");
  return NextResponse.json({ clientId });
}
