import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, e2eeSignalDevices, e2eeSignalEnvelopes, messages } from "@/db/schema";
import { getMembership } from "@/server/chat";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";

/**
 * **SECURITY WARNING:** This is a PRE-PRODUCTION implementation that has NOT
 * undergone formal security audit. DO NOT use in production without external
 * cryptographic review.
 *
 * **CRITICAL LIMITATIONS:**
 * - Message sending does not verify encryption status
 * - No rate limiting for message sending
 * - No message size validation beyond ciphertext length
 * - No sender identity verification in envelope
 *
 * **REQUIRED BEFORE PRODUCTION:**
 * - Encryption status verification
 * - Rate limiting
 * - Message size validation
 * - Sender identity verification
 * - Formal security review
 */

export const dynamic = "force-dynamic";
const MAX_ENVELOPES = 50;
const MAX_CIPHERTEXT = 256 * 1024;

type Envelope = { recipientUserId: string; recipientDeviceId: string; ciphertext: string };

function parseEnvelope(value: unknown): Envelope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!isUuid(String(item.recipientUserId ?? "")) || typeof item.recipientDeviceId !== "string" || !item.recipientDeviceId || typeof item.ciphertext !== "string" || !item.ciphertext || item.ciphertext.length > MAX_CIPHERTEXT) return null;
  return { recipientUserId: String(item.recipientUserId), recipientDeviceId: item.recipientDeviceId, ciphertext: item.ciphertext };
}

/** Atomically persist a v2 message marker and every recipient-device envelope. */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");
  const data = await readJson(req);
  if (!data) return jsonError(422, "A valid JSON body is required.");
  const conversationId = typeof data.conversationId === "string" ? data.conversationId : "";
  const senderDeviceId = typeof data.senderDeviceId === "string" ? data.senderDeviceId : "";
  const clientMessageId = typeof data.clientMessageId === "string" ? data.clientMessageId : "";
  const rawEnvelopes = data.envelopes;
  if (!isUuid(conversationId) || !senderDeviceId || !isUuid(clientMessageId) || !Array.isArray(rawEnvelopes) || rawEnvelopes.length === 0 || rawEnvelopes.length > MAX_ENVELOPES) return jsonError(422, "Invalid Signal message envelope batch.");
  const envelopes = rawEnvelopes.map(parseEnvelope);
  if (envelopes.some((value) => !value)) return jsonError(422, "Invalid Signal ciphertext envelope.");
  const valid = envelopes as Envelope[];
  const keys = new Set(valid.map((item) => `${item.recipientUserId}:${item.recipientDeviceId}`));
  if (keys.size !== valid.length) return jsonError(422, "Duplicate recipient device envelope.");
  if (!await getMembership(conversationId, user.id)) return jsonError(404, "Conversation not found.");

  const members = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, conversationId));
  const memberIds = members.map((member) => member.userId);
  const devices = await db.select({ userId: e2eeSignalDevices.userId, deviceId: e2eeSignalDevices.deviceId }).from(e2eeSignalDevices).where(and(inArray(e2eeSignalDevices.userId, memberIds), isNull(e2eeSignalDevices.revokedAt)));
  if (!devices.some((device) => device.userId === user.id && device.deviceId === senderDeviceId)) return jsonError(403, "Unknown sender Signal device.");
  const expected = new Set(devices.filter((device) => !(device.userId === user.id && device.deviceId === senderDeviceId)).map((device) => `${device.userId}:${device.deviceId}`));
  if (expected.size !== keys.size || [...expected].some((key) => !keys.has(key))) return jsonError(422, "An envelope is required for every active recipient device.");

  const message = await db.transaction(async (tx) => {
    const [created] = await tx.insert(messages).values({ conversationId, senderId: user.id, clientMessageId, text: "signal:v2", encrypted: true }).onConflictDoNothing().returning({ id: messages.id, createdAt: messages.createdAt });
    if (!created) {
      const [existing] = await tx.select({
        id: messages.id,
        createdAt: messages.createdAt,
        conversationId: messages.conversationId,
        text: messages.text,
        encrypted: messages.encrypted,
      }).from(messages).where(and(eq(messages.senderId, user.id), eq(messages.clientMessageId, clientMessageId))).limit(1);
      // The client-generated id is globally unique per sender. Retrying the
      // same send is safe, but reusing it for another conversation or a
      // non-Signal message must never be mistaken for a successful delivery.
      if (!existing || existing.conversationId !== conversationId || existing.text !== "signal:v2" || !existing.encrypted) return null;
      return { id: existing.id, createdAt: existing.createdAt };
    }
    await tx.insert(e2eeSignalEnvelopes).values(valid.map((item) => ({ messageId: created.id, senderUserId: user.id, senderDeviceId, recipientUserId: item.recipientUserId, recipientDeviceId: item.recipientDeviceId, ciphertext: item.ciphertext }))).onConflictDoNothing();
    return created;
  });
  if (!message) return jsonError(409, "Could not persist Signal message.");
  return NextResponse.json({ message });
}
