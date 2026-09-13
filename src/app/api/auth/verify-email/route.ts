import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson } from "@/server/http";
import { consumeEmailVerification } from "@/server/email-verification";

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const token = typeof body?.token === "string" ? body.token : "";
  if (token.length < 32) return jsonError(400, "Invalid verification link.");
  const result = await consumeEmailVerification(token);
  return result === "verified" ? NextResponse.json({ ok: true }) : jsonError(400, "This verification link is invalid or has expired.");
}
