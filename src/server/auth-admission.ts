import { createHash } from "node:crypto";

const PATHS = new Set(["login", "register", "forgot-password", "reset-password", "resend-verification", "verify-email", "mfa"]);
export function admissionProtected(path: string, method: string) {
  return method === "POST" && PATHS.has(path.replace(/^\/api\/auth\//, "")) && path.startsWith("/api/auth/");
}

/** A bounded process-local first layer; existing shared account/IP limits remain authoritative. */
export function createAuthAdmission() {
  const clients = new Map<string, { tokens: number; at: number }>();
  const total = { tokens: 60, at: 0 };
  function refill(bucket: { tokens: number; at: number }, capacity: number, rate: number, now: number) {
    bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, now - bucket.at) * rate / 60000);
    bucket.at = now;
  }
  return {
    allow(ip: string, now = Date.now()) {
      refill(total, 60, 120, now);
      // Drop distributed bursts before hashing or allocating a client entry.
      if (total.tokens < 1) return false;
      const key = createHash("sha256").update(ip).digest("hex");
      let client = clients.get(key);
      if (!client) {
        if (clients.size >= 4096) {
          for (const [key, value] of clients) if (now - value.at > 60000) clients.delete(key);
          if (clients.size >= 4096) return false;
        }
        client = { tokens: 10, at: now }; clients.set(key, client);
      }
      refill(client, 10, 20, now);
      if (total.tokens < 1 || client.tokens < 1) return false;
      total.tokens--; client.tokens--; return true;
    },
    size: () => clients.size,
  };
}

const state = globalThis as typeof globalThis & { __authAdmission?: ReturnType<typeof createAuthAdmission> };
export const authAdmission = state.__authAdmission ??= createAuthAdmission();
