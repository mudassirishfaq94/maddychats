import { createHmac, timingSafeEqual } from "node:crypto";
import { jwtSecret } from "./config";
export function googleLinkBinding(userId: string, sessionId: string, state: string): string {
  return createHmac("sha256", jwtSecret()).update(JSON.stringify(["google-link-v1", userId, sessionId, state])).digest("hex");
}
export function matchesGoogleLinkBinding(value: string | undefined, userId: string, sessionId: string, state: string): boolean {
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return false;
  return timingSafeEqual(Buffer.from(value, "hex"), Buffer.from(googleLinkBinding(userId, sessionId, state), "hex"));
}
