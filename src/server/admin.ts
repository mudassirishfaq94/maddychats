/**
 * Admin guard — uses database-backed roles (user | moderator | admin).
 * Audit trail: every admin action is logged immutably.
 */

import { eq, inArray, asc } from "drizzle-orm";
import { db } from "@/db";
import { users, adminAuditLog } from "@/db/schema";
import { getSessionUser } from "./session";
import { is2FAEnabled } from "./two-factor";
import type { SafeUser } from "@/lib/types";

/** Check if a user has admin or moderator role */
export async function requireAdmin(): Promise<SafeUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");

  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!row || (row.role !== "admin" && row.role !== "moderator")) {
    throw new Error("FORBIDDEN");
  }

  if (!(await is2FAEnabled(user.id))) throw new Error("ADMIN_MFA_REQUIRED");
  return user;
}

/** Check if a user has admin role specifically */
export async function requireSuperAdmin(): Promise<SafeUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");

  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!row || row.role !== "admin") {
    throw new Error("FORBIDDEN");
  }

  if (!(await is2FAEnabled(user.id))) throw new Error("ADMIN_MFA_REQUIRED");
  return user;
}

/** Get a user's role from the database */
export async function getUserRole(userId: string): Promise<string> {
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row?.role ?? "user";
}

/** Immutable audit trail — append-only, never updates or deletes */
export async function auditLog(input: {
  adminId: string;
  action: string;
  targetUserId?: string;
  targetMessageId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(adminAuditLog).values({
    adminId: input.adminId,
    action: input.action,
    targetUserId: input.targetUserId ?? null,
    targetMessageId: input.targetMessageId ?? null,
    details: input.details ?? null,
  });
}

export type AdminTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function lockAdminSubjects(tx: AdminTransaction, actorId: string, subjectId: string) {
  const rows = await tx.select({ id: users.id, role: users.role }).from(users).where(inArray(users.id, [actorId, subjectId])).orderBy(asc(users.id)).for("update");
  return { actor: rows.find((row) => row.id === actorId), target: rows.find((row) => row.id === subjectId) };
}

/** Changes and their audit record commit together; actor/target locks prevent
 * concurrent role changes from invalidating the permission decision. */
export async function suspendUser(adminId: string, targetUserId: string, options: { reason: string; until?: Date }) {
  await db.transaction(async (tx) => {
    const { actor, target } = await lockAdminSubjects(tx, adminId, targetUserId);
    if (!target) throw new Error("NOT_FOUND");
    if (!actor || !["admin", "moderator"].includes(actor.role) || adminId === targetUserId || target.role === "admin" || (actor.role === "moderator" && target.role !== "user")) throw new Error("FORBIDDEN");
    await tx.update(users).set({ suspendedAt: new Date(), suspendedUntil: options.until ?? null, suspensionReason: options.reason, suspendedBy: adminId, tokenInvalidBeforeAt: new Date() }).where(eq(users.id, targetUserId));
    await tx.insert(adminAuditLog).values({ adminId, action: "user_suspended", targetUserId, details: { actorUserId: adminId, subjectUserId: targetUserId, reason: options.reason, until: options.until?.toISOString() ?? null } });
  });
}

export async function unsuspendUser(adminId: string, targetUserId: string) {
  await db.transaction(async (tx) => {
    const { actor, target } = await lockAdminSubjects(tx, adminId, targetUserId);
    if (!target) throw new Error("NOT_FOUND");
    if (!actor || !["admin", "moderator"].includes(actor.role) || target.role === "admin" || (actor.role === "moderator" && target.role !== "user")) throw new Error("FORBIDDEN");
    // Never clear the revocation watermark when restoring an account.
    await tx.update(users).set({ suspendedAt: null, suspendedUntil: null, suspensionReason: null, suspendedBy: null }).where(eq(users.id, targetUserId));
    await tx.insert(adminAuditLog).values({ adminId, action: "user_unsuspended", targetUserId, details: { actorUserId: adminId, subjectUserId: targetUserId } });
  });
}

export async function setUserRole(adminId: string, targetUserId: string, newRole: "user" | "moderator" | "admin") {
  await db.transaction(async (tx) => {
    const { actor, target } = await lockAdminSubjects(tx, adminId, targetUserId);
    if (!target) throw new Error("NOT_FOUND");
    if (!actor || actor.role !== "admin" || target.role === "admin" || adminId === targetUserId) throw new Error("FORBIDDEN");
    await tx.update(users).set({ role: newRole, tokenInvalidBeforeAt: new Date() }).where(eq(users.id, targetUserId));
    await tx.insert(adminAuditLog).values({ adminId, action: "role_changed", targetUserId, details: { actorUserId: adminId, subjectUserId: targetUserId, from: target.role, to: newRole } });
  });
}

/** Check if a user is currently suspended */
export async function isUserSuspended(userId: string): Promise<{
  suspended: boolean;
  permanent?: boolean;
  until?: Date;
  reason?: string;
}> {
  const [row] = await db
    .select({
      suspendedAt: users.suspendedAt,
      suspendedUntil: users.suspendedUntil,
      suspensionReason: users.suspensionReason,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row?.suspendedAt) return { suspended: false };

  // Check if temporary suspension has expired
  if (row.suspendedUntil && row.suspendedUntil < new Date()) {
    return { suspended: false };
  }

  return {
    suspended: true,
    permanent: !row.suspendedUntil,
    until: row.suspendedUntil ?? undefined,
    reason: row.suspensionReason ?? undefined,
  };
}
