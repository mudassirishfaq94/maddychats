import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  reports,
  loginHistory,
  privacySettings,
  adminAuditLog,
  users,
  messages,
} from "@/db/schema";

/* ========================== Reports ========================== */

export async function createReport(input: {
  reporterId: string;
  type: "user" | "message";
  reason: string;
  description?: string;
  targetUserId?: string;
  targetMessageId?: string;
}) {
  const [report] = await db
    .insert(reports)
    .values({
      reporterId: input.reporterId,
      type: input.type,
      reason: input.reason as any,
      description: input.description || null,
      targetUserId: input.targetUserId || null,
      targetMessageId: input.targetMessageId || null,
    })
    .returning();
  return report;
}

export async function getReports(status?: string, limit = 50) {
  const targetUsers = alias(users, "target_users");
  const validStatuses = new Set(["pending", "reviewed", "resolved", "dismissed"]);
  const where = status && validStatuses.has(status)
    ? eq(reports.status, status as "pending" | "reviewed" | "resolved" | "dismissed")
    : undefined;
  return db
    .select({
      id: reports.id,
      type: reports.type,
      reason: reports.reason,
      description: reports.description,
      status: reports.status,
      createdAt: reports.createdAt,
      reporter: {
        id: users.id,
        displayName: users.displayName,
        username: users.username,
      },
      targetUser: {
        id: targetUsers.id,
        displayName: targetUsers.displayName,
        username: targetUsers.username,
      },
    })
    .from(reports)
    .innerJoin(users, eq(reports.reporterId, users.id))
    .leftJoin(targetUsers, eq(reports.targetUserId, targetUsers.id))
    .where(where)
    .orderBy(desc(reports.createdAt))
    .limit(limit);
}

export async function updateReportStatus(
  reportId: string,
  status: string,
  reviewedById: string,
  reviewNote?: string
) {
  const [updated] = await db
    .update(reports)
    .set({
      status: status as any,
      reviewedById,
      reviewNote: reviewNote || null,
      reviewedAt: new Date(),
    })
    .where(eq(reports.id, reportId))
    .returning();
  return updated;
}

/* ========================== Login History ========================== */

export async function recordLoginAttempt(input: {
  userId?: string;
  identifier: string;
  success: boolean;
  ipAddress?: string;
  userAgent?: string;
}) {
  await db.insert(loginHistory).values({
    userId: input.userId || null,
    identifier: input.identifier,
    success: input.success,
    ipAddress: input.ipAddress || null,
    userAgent: input.userAgent || null,
  });
}

export async function getLoginHistory(userId: string, limit = 20) {
  return db
    .select()
    .from(loginHistory)
    .where(eq(loginHistory.userId, userId))
    .orderBy(desc(loginHistory.createdAt))
    .limit(limit);
}

export async function getFailedLogins(userId: string, since: Date) {
  return db
    .select()
    .from(loginHistory)
    .where(
      and(
        eq(loginHistory.userId, userId),
        eq(loginHistory.success, false),
        sql`${loginHistory.createdAt} > ${since}`
      )
    )
    .orderBy(desc(loginHistory.createdAt));
}

/* ========================== Privacy Settings ========================== */

export interface PrivacySettingsInput {
  profileVisibility?: string;
  lastSeenVisibility?: string;
  statusVisibility?: string;
  whoCanMessage?: string;
  loginAlerts?: boolean;
  readReceipts?: boolean;
  typingIndicators?: boolean;
}

export async function getPrivacySettings(userId: string) {
  const [settings] = await db
    .select()
    .from(privacySettings)
    .where(eq(privacySettings.userId, userId));
  return settings || null;
}

export async function upsertPrivacySettings(
  userId: string,
  input: PrivacySettingsInput
) {
  const existing = await getPrivacySettings(userId);
  if (existing) {
    const patch: Record<string, any> = { updatedAt: new Date() };
    if (input.profileVisibility !== undefined)
      patch.profileVisibility = input.profileVisibility;
    if (input.lastSeenVisibility !== undefined)
      patch.lastSeenVisibility = input.lastSeenVisibility;
    if (input.statusVisibility !== undefined)
      patch.statusVisibility = input.statusVisibility;
    if (input.whoCanMessage !== undefined)
      patch.whoCanMessage = input.whoCanMessage;
    if (input.loginAlerts !== undefined) patch.loginAlerts = input.loginAlerts;
    if (input.readReceipts !== undefined)
      patch.readReceipts = input.readReceipts;
    if (input.typingIndicators !== undefined)
      patch.typingIndicators = input.typingIndicators;

    const [updated] = await db
      .update(privacySettings)
      .set(patch)
      .where(eq(privacySettings.userId, userId))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(privacySettings)
      .values({
        userId,
        profileVisibility: input.profileVisibility || "everyone",
        lastSeenVisibility: input.lastSeenVisibility || "everyone",
        statusVisibility: input.statusVisibility || "everyone",
        whoCanMessage: input.whoCanMessage || "everyone",
        loginAlerts: input.loginAlerts ?? true,
        readReceipts: input.readReceipts ?? true,
        typingIndicators: input.typingIndicators ?? true,
      })
      .returning();
    return created;
  }
}

/* ========================== Admin Audit Log ========================== */

export async function auditLog(input: {
  adminId: string;
  action: string;
  targetUserId?: string;
  targetMessageId?: string;
  details?: Record<string, any>;
}) {
  await db.insert(adminAuditLog).values({
    adminId: input.adminId,
    action: input.action,
    targetUserId: input.targetUserId || null,
    targetMessageId: input.targetMessageId || null,
    details: input.details || null,
  });
}

export async function getAuditLog(limit = 100) {
  return db
    .select({
      id: adminAuditLog.id,
      action: adminAuditLog.action,
      details: adminAuditLog.details,
      createdAt: adminAuditLog.createdAt,
      admin: {
        id: users.id,
        displayName: users.displayName,
        username: users.username,
      },
    })
    .from(adminAuditLog)
    .innerJoin(users, eq(adminAuditLog.adminId, users.id))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit);
}

/* ========================== Account Deletion ========================== */

export async function deleteAccount(userId: string) {
  // Delete user's data (cascades handle most of it)
  await db.delete(users).where(eq(users.id, userId));
}

/* ========================== Data Export ========================== */

export async function exportUserData(userId: string) {
  const user = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const loginEntries = await getLoginHistory(userId, 100);
  const privacy = await getPrivacySettings(userId);

  return {
    profile: user[0] || null,
    loginHistory: loginEntries.map((l) => ({
      success: l.success,
      ipAddress: l.ipAddress,
      createdAt: l.createdAt,
    })),
    privacySettings: privacy
      ? {
          profileVisibility: privacy.profileVisibility,
          lastSeenVisibility: privacy.lastSeenVisibility,
          statusVisibility: privacy.statusVisibility,
          whoCanMessage: privacy.whoCanMessage,
          loginAlerts: privacy.loginAlerts,
          readReceipts: privacy.readReceipts,
          typingIndicators: privacy.typingIndicators,
        }
      : null,
    exportedAt: new Date().toISOString(),
  };
}
