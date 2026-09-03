import { randomBytes } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notificationPreferences, oauthAccounts, users } from "@/db/schema";
import { clientUrl, googleCallbackUrl, SESSION_COOKIE } from "@/server/config";
import { hashPassword } from "@/server/password";
import { createSessionToken, getSessionUser, sessionCookieOptions } from "@/server/session";
import { requestIsSecure } from "@/server/http";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GOOGLE_OAUTH_COOKIES = ["google_oauth_state", "google_oauth_nonce", "google_oauth_verifier", "google_oauth_next", "google_oauth_mode"];

function finishGoogleOAuth(response: NextResponse) {
  for (const name of GOOGLE_OAUTH_COOKIES) {
    response.cookies.set(name, "", { path: "/api/auth/google", maxAge: 0 });
  }
  return response;
}

function redirectError(code: string) {
  return NextResponse.redirect(new URL(`/login?error=${code}`, clientUrl()));
}

async function handleGoogleCallback(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get("google_oauth_state")?.value;
  const nonce = req.cookies.get("google_oauth_nonce")?.value;
  const verifier = req.cookies.get("google_oauth_verifier")?.value;
  const next = req.cookies.get("google_oauth_next")?.value ?? "/app";
  const linking = req.cookies.get("google_oauth_mode")?.value === "link";
  if (!code || !state || !expectedState || state !== expectedState || !nonce || !verifier) return redirectError("google_invalid_state");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return redirectError("google_not_configured");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: googleCallbackUrl(), grant_type: "authorization_code", code_verifier: verifier }) });
  if (!tokenResponse.ok) return redirectError("google_failed");
  const tokens = await tokenResponse.json() as { id_token?: string };
  if (!tokens.id_token) return redirectError("google_failed");

  let claims;
  try {
    ({ payload: claims } = await jwtVerify(tokens.id_token, googleKeys, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: clientId }));
  } catch { return redirectError("google_failed"); }
  if (claims.nonce !== nonce || !claims.sub || typeof claims.email !== "string" || claims.email_verified !== true) return redirectError("google_unverified");

  if (linking) {
    const currentUser = await getSessionUser();
    if (!currentUser) return finishGoogleOAuth(NextResponse.redirect(new URL("/login?next=/app/profile", clientUrl())));

    const [identityOwner] = await db
      .select({ userId: oauthAccounts.userId })
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerAccountId, claims.sub)))
      .limit(1);
    if (identityOwner && identityOwner.userId !== currentUser.id) {
      return finishGoogleOAuth(NextResponse.redirect(new URL("/app/profile?auth_error=google_in_use", clientUrl())));
    }

    const [currentGoogle] = await db
      .select({ providerAccountId: oauthAccounts.providerAccountId })
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, currentUser.id), eq(oauthAccounts.provider, "google")))
      .limit(1);
    if (currentGoogle && currentGoogle.providerAccountId !== claims.sub) {
      return finishGoogleOAuth(NextResponse.redirect(new URL("/app/profile?auth_error=google_already_linked", clientUrl())));
    }
    if (!identityOwner && !currentGoogle) {
      try {
        await db.insert(oauthAccounts).values({
          userId: currentUser.id,
          provider: "google",
          providerAccountId: claims.sub,
        });
      } catch {
        return finishGoogleOAuth(NextResponse.redirect(new URL("/app/profile?auth_error=google_in_use", clientUrl())));
      }
    }
    return finishGoogleOAuth(NextResponse.redirect(new URL("/app/profile?auth_linked=google", clientUrl())));
  }

  let account = await db.select({ user: users }).from(oauthAccounts).innerJoin(users, eq(oauthAccounts.userId, users.id)).where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerAccountId, claims.sub))).limit(1);
  let user = account[0]?.user;
  if (!user) {
    const emailTaken = await db.select().from(users).where(sql`lower(${users.email}) = ${claims.email.toLowerCase()}`).limit(1);
    if (emailTaken[0]) {
      const domain = claims.email.split("@")[1]?.toLowerCase();
      const googleIsAuthoritative = domain === "gmail.com" || typeof claims.hd === "string";
      if (!googleIsAuthoritative) return redirectError("google_email_exists");
      await db.insert(oauthAccounts).values({ userId: emailTaken[0].id, provider: "google", providerAccountId: claims.sub }).onConflictDoNothing();
      user = emailTaken[0];
    }
  }
  if (!user) {
    const base = claims.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 14) || "maddyuser";
    let username = base;
    for (let i = 0; i < 20; i++) {
      const found = await db.select({ id: users.id }).from(users).where(sql`lower(${users.username}) = ${username.toLowerCase()}`).limit(1);
      if (!found[0]) break;
      username = `${base.slice(0, 14)}${randomBytes(3).toString("hex")}`;
    }
    const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
    user = await db.transaction(async (tx) => {
      const created = await tx.insert(users).values({ displayName: typeof claims.name === "string" ? claims.name.slice(0, 50) : username, username, email: claims.email!.toLowerCase(), passwordHash, avatarUrl: typeof claims.picture === "string" ? claims.picture : null }).returning();
      await tx.insert(notificationPreferences).values({ userId: created[0].id });
      await tx.insert(oauthAccounts).values({ userId: created[0].id, provider: "google", providerAccountId: claims.sub! });
      return created[0];
    });
  }

  const response = NextResponse.redirect(new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/app", clientUrl()));
  response.cookies.set(SESSION_COOKIE, await createSessionToken(user.id, user.username), sessionCookieOptions(requestIsSecure(req)));
  return finishGoogleOAuth(response);
}

export async function GET(req: NextRequest) {
  try {
    return await handleGoogleCallback(req);
  } catch (error) {
    console.error("[maddy-chats] Google sign-in failed:", error);
    return redirectError("google_failed");
  }
}
