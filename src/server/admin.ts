/**
 * Admin guard — uses database-backed roles (user | moderator | admin).
 * Audit trail: every admin action is logged immutably.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, adminAuditLog } from "@/db/schema";
import { getSessionUser } from "./session";
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

/** Suspend a user (temporary or permanent) */
export async function suspendUser(
  adminId: string,
  targetUserId: string,
  options: {
    reason: string;
    until?: Date; // null = permanent
  },
): Promise<void> {
  // Prevent self-suspension
  if (adminId === targetUserId) return;

  // Prevent suspending other admins (only super admin can)
  const targetRole = await getUserRole(targetUserId);
  if (targetRole === "admin") return;

  await db
    .update(users)
    .set({
      suspendedAt: new Date(),
      suspendedUntil: options.until ?? null,
      suspensionReason: options.reason,
      suspendedBy: adminId,
      // Revoke all sessions
      tokenInvalidBeforeAt: new Date(),
    })
    .where(eq(users.id, targetUserId));

  await auditLog({
    adminId,
    action: "user_suspended",
    targetUserId,
    details: {
      reason: options.reason,
      until: options.until?.toISOString() ?? "permanent",
    },
  });
}

/** Unsuspend a user */
export async function unsuspendUser(
  adminId: string,
  targetUserId: string,
): Promise<void> {
  await db
    .update(users)
    .set({
      suspendedAt: null,
      suspendedUntil: null,
      suspensionReason: null,
      suspendedBy: null,
    })
    .where(eq(users.id, targetUserId));

  await auditLog({
    adminId,
    action: "user_unsuspended",
    targetUserId,
  });
}

/** Change a user's role */
export async function setUserRole(
  adminId: string,
  targetUserId: string,
  newRole: "user" | "moderator" | "admin",
): Promise<void> {
  // Prevent self-demotion
  if (adminId === targetUserId && newRole !== "admin") return;

  const oldRole = await getUserRole(targetUserId);

  await db
    .update(users)
    .set({ role: newRole })
    .where(eq(users.id, targetUserId));

  await auditLog({
    adminId,
    action: "role_changed",
    targetUserId,
    details: { from: oldRole, to: newRole },
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
