import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { oauthAccounts } from "@/db/schema";
import { phoneAuthExchangeSchema } from "@/lib/schemas";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { getSessionUser } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROVIDER = "firebase_phone";

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in to link a phone number.");

  const parsed = phoneAuthExchangeSchema.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "Invalid phone-linking request.");

  let identity;
  try {
    const missingAdminVariables = [
      "FIREBASE_PROJECT_ID",
      "FIREBASE_CLIENT_EMAIL",
      "FIREBASE_PRIVATE_KEY",
    ].filter((name) => !process.env[name]?.trim());
    if (missingAdminVariables.length) {
      return jsonError(503, `Phone authentication server configuration is missing: ${missingAdminVariables.join(", ")}.`);
    }
    const { verifyFirebaseIdToken } = await import("@/server/firebase-admin");
    identity = await verifyFirebaseIdToken(parsed.data.idToken);
    if (!identity.phoneNumber || identity.decodedToken.firebase.sign_in_provider !== "phone") {
      return jsonError(401, "A verified Firebase phone identity is required.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("not configured")) {
      return jsonError(503, "Phone authentication is not configured yet.");
    }
    return jsonError(401, "Phone verification is invalid or has expired.");
  }

  const [identityOwner] = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(and(
      eq(oauthAccounts.provider, PROVIDER),
      eq(oauthAccounts.providerAccountId, identity.uid),
    ))
    .limit(1);

  if (identityOwner && identityOwner.userId !== user.id) {
    return jsonError(
      409,
      "This phone number is connected to another Maddy Chats account. Sign out and use phone sign-in to recover that account. Accounts are never merged automatically.",
    );
  }
  if (identityOwner) return Response.json({ linked: true, alreadyLinked: true });

  const [currentPhone] = await db
    .select({ providerAccountId: oauthAccounts.providerAccountId })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.userId, user.id), eq(oauthAccounts.provider, PROVIDER)))
    .limit(1);
  if (currentPhone) {
    return jsonError(409, "A different phone number is already connected to this account.");
  }

  try {
    await db.insert(oauthAccounts).values({
      userId: user.id,
      provider: PROVIDER,
      providerAccountId: identity.uid,
    });
  } catch {
    return jsonError(409, "That phone identity was linked by another request. Refresh and try again.");
  }

  return Response.json({ linked: true });
}
