-- Message previews are enabled for users who never changed their notification
-- preferences. Rows edited before this migration keep their current choice,
-- which conservatively preserves any explicit opt-out.
ALTER TABLE "notification_preferences"
  ALTER COLUMN "show_notification_details" SET DEFAULT true;

UPDATE "notification_preferences"
SET "show_notification_details" = true
WHERE "show_notification_details" = false
  AND "updated_at" <= "created_at";
