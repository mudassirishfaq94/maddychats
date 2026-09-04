import { eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthAccounts } from "@/db/schema";
import { jsonError } from "@/server/http";
import { getSessionUser } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const identities = await db
    .select({ provider: oauthAccounts.provider })
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, user.id));
  const providers = new Set(identities.map((identity) => identity.provider));

  return Response.json({
    methods: {
      email: !user.email.endsWith("@auth.maddychats.invalid"),
      google: providers.has("google"),
    },
  });
}
