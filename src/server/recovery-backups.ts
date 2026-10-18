import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { recoveryBackups } from "@/db/schema";
import type { RecoveryEnvelope } from "@/lib/cloud-key-recovery";
export async function listRecoveryBackups(userId: string) {
  return db.select({ id: recoveryBackups.id, deviceId: recoveryBackups.deviceId, revision: recoveryBackups.revision, confirmed: recoveryBackups.confirmed, updatedAt: recoveryBackups.updatedAt })
    .from(recoveryBackups).where(eq(recoveryBackups.userId,userId)).orderBy(desc(recoveryBackups.updatedAt)).limit(20);
}
export async function readRecoveryBackup(userId: string, id: string) {
  return (await db.select().from(recoveryBackups).where(and(eq(recoveryBackups.userId,userId),eq(recoveryBackups.id,id))).limit(1))[0] ?? null;
}
export async function saveRecoveryBackup(userId: string, sessionId: string, input: { id: string; deviceId: string; revision: number; confirmed: boolean; envelope: RecoveryEnvelope }) {
  return db.transaction(async tx => {
    // Serialize account quota and revision checks; lock trust/session against concurrent revocation.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`recovery-backups:${userId}`},0))`);
    const proof = await tx.execute(sql`select k.id from e2ee_keys k join device_sessions s on s.id=k.session_id
      where k.user_id=${userId} and k.device_id=${input.deviceId} and k.trusted_at is not null and s.id=${sessionId}
        and s.user_id=${userId} and s.revoked_at is null and s.expires_at>now() and not s.approval_required for share of k,s`);
    if (!proof.rows.length) return null;
    const [existing] = await tx.select().from(recoveryBackups).where(eq(recoveryBackups.id,input.id)).for("update");
    if (existing) {
      if (existing.userId!==userId || existing.deviceId!==input.deviceId || existing.revision!==input.revision) return null;
      return (await tx.update(recoveryBackups).set({ envelope:input.envelope,revision:existing.revision+1,confirmed:existing.confirmed || input.confirmed,updatedAt:new Date() }).where(eq(recoveryBackups.id,input.id)).returning({ revision:recoveryBackups.revision }))[0];
    }
    if (input.revision!==0 || (await tx.select({ id:recoveryBackups.id }).from(recoveryBackups).where(eq(recoveryBackups.userId,userId)).limit(20)).length>=20) return null;
    return (await tx.insert(recoveryBackups).values({ id:input.id,userId,deviceId:input.deviceId,envelope:input.envelope,confirmed:input.confirmed }).returning({ revision:recoveryBackups.revision }))[0];
  });
}
