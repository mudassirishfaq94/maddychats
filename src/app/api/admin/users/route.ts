import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, suspendUser, unsuspendUser, setUserRole, auditLog } from "@/server/admin";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** List all users (admin only) */
export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  try {
    const admin = await requireAdmin();

    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
        suspendedAt: users.suspendedAt,
        suspendedUntil: users.suspendedUntil,
        suspensionReason: users.suspensionReason,
        createdAt: users.createdAt,
        lastSeenAt: users.lastSeenAt,
      })
      .from(users)
      .orderBy(sql`${users.createdAt} DESC`);

    return NextResponse.json({ users: allUsers });
  } catch (e) {
    if ((e as Error).message === "UNAUTHENTICATED") return jsonError(401, "Not authenticated.");
    return jsonError(403, "Admin access required.");
  }
}

/** Update user role or suspend/unsuspend */
export async function PATCH(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  try {
    const admin = await requireAdmin();
    const body = await readJson(req);
    const data = (body ?? {}) as Record<string, unknown>;

    const userId = data.userId ? String(data.userId) : null;
    const action = data.action ? String(data.action) : null;

    if (!userId || !action) return jsonError(422, "userId and action are required.");

    switch (action) {
      case "role": {
        const role = data.role ? String(data.role) : null;
        if (!role || !["user", "moderator", "admin"].includes(role)) {
          return jsonError(422, "Valid role is required (user, moderator, admin).");
        }
        await setUserRole(admin.id, userId, role as "user" | "moderator" | "admin");
        break;
      }
      case "suspend": {
        const reason = data.reason ? String(data.reason) : "No reason provided";
        const days = data.days ? Number(data.days) : undefined;
        const until = days ? new Date(Date.now() + days * 86_400_000) : undefined;
        await suspendUser(admin.id, userId, { reason, until });
        break;
      }
      case "unsuspend": {
        await unsuspendUser(admin.id, userId);
        break;
      }
      default:
        return jsonError(422, `Unknown action: ${action}`);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    if ((e as Error).message === "UNAUTHENTICATED") return jsonError(401, "Not authenticated.");
    if ((e as Error).message === "FORBIDDEN") return jsonError(403, "Admin access required.");
    return jsonError(500, "Action failed.");
  }
}
