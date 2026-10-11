import type { NextRequest } from "next/server";
import { requireAdmin, requireSuperAdmin, type AdminTransaction } from "./admin";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyFreshAuthentication } from "./authentication";
import { is2FAEnabled } from "./two-factor";
import { rateLimit } from "./rate-limit";
import { jsonError } from "./http";
import { passwordBusyResponse } from "./password-capacity";

export class AdminActionError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/** All privileged writes require enabled MFA and primary authentication less
 * than five minutes old, or password plus an unused MFA/recovery proof.
 */
export async function authorizeAdminMutation(req: NextRequest, body: Record<string, unknown> | null, superOnly = false) {
  const admin = await (superOnly ? requireSuperAdmin() : requireAdmin());
  if (!(await rateLimit(`admin-proof:${admin.id}`, 10, 600000)).allowed) throw new AdminActionError(429, "Too many attempts. Try again later.");
  if (!(await is2FAEnabled(admin.id))) throw new AdminActionError(403, "Enable two-factor authentication in your profile before changing administrative data.");
  if (!(await verifyFreshAuthentication(admin.id, body))) throw new AdminActionError(403, "Confirm your password and authenticator/recovery code, or sign in again before this action.");
  // req is intentionally available to keep the guard's API tied to a request.
  if (req.signal.aborted) throw new AdminActionError(400, "Request canceled.");
  return admin;
}

export function adminActionError(error: unknown) {
  const busy = passwordBusyResponse(error); if (busy) return busy;
  if (error instanceof AdminActionError) return jsonError(error.status, error.message);
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHENTICATED") return jsonError(401, "Not authenticated.");
  if (message === "FORBIDDEN") return jsonError(403, "Administrator permission required.");
  if (message === "NOT_FOUND") return jsonError(404, "Target not found.");
  return jsonError(500, "Administrative action failed.");
}

/** Recheck database role under a lock inside the mutation transaction. */
export async function lockAdminActor(tx: AdminTransaction, userId: string, superOnly = false) {
  const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, userId)).for("update");
  if (!actor || (superOnly ? actor.role !== "admin" : !["admin", "moderator"].includes(actor.role))) throw new Error("FORBIDDEN");
}
