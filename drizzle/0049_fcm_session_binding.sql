-- Legacy unbound tokens stay ineligible until the authenticated device registers again.
ALTER TABLE "fcm_tokens" ADD COLUMN "session_id" uuid REFERENCES "device_sessions"("id") ON DELETE CASCADE;
-- Rollback: ALTER TABLE "fcm_tokens" DROP COLUMN "session_id";
