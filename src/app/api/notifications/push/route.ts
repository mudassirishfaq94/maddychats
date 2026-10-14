import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { pushConfiguration } from "@/server/push-configuration";
import { isSupportedPushEndpoint } from "@/lib/push-endpoint";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!await getSessionUser()) return jsonError(401, "Not authenticated.");
  const configuration = pushConfiguration();
  return NextResponse.json({ publicKey: configuration?.publicKey ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048).refine(isSupportedPushEndpoint, "A supported browser push service is required."),
  keys: z.object({
    p256dh: z.string().min(20).max(512),
    auth: z.string().min(8).max(256),
  }),
});

const deleteSchema = z.object({ endpoint: z.string().url().max(2048) });

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");
  if (!pushConfiguration()) return jsonError(503, "Push alerts are temporarily unavailable. Please try again later.");
  const body = await readJson(req);
  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid push subscription.");

  await db.insert(pushSubscriptions).values({
    userId: me.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
  }).onConflictDoUpdate({
    target: pushSubscriptions.endpoint,
    set: {
      userId: me.id,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      updatedAt: new Date(),
    },
  });
  return NextResponse.json({ subscribed: true });
}

export async function DELETE(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");
  const body = await readJson(req);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid push subscription.");
  await db.delete(pushSubscriptions).where(and(
    eq(pushSubscriptions.userId, me.id),
    eq(pushSubscriptions.endpoint, parsed.data.endpoint),
  ));
  return NextResponse.json({ subscribed: false });
}
