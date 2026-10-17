-- Let each user choose whether push alerts reveal sender and message preview.
-- Default hidden: do not expand notification data disclosure for existing accounts.
ALTER TABLE "notification_preferences"
  ADD COLUMN "show_notification_details" boolean NOT NULL DEFAULT false;

-- Rollback: ALTER TABLE "notification_preferences" DROP COLUMN "show_notification_details";
