-- Existing registered devices predate QR pairing and remain trusted. Devices
-- registered after this migration stay pending until a trusted device approves
-- their pairing request; pending devices are excluded from key distribution.
-- Preserve pending devices on databases already upgraded manually.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'e2ee_keys' AND column_name = 'trusted_at'
  ) THEN
    ALTER TABLE "e2ee_keys" ADD COLUMN "trusted_at" timestamp with time zone;
    UPDATE "e2ee_keys" SET "trusted_at" = "created_at";
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "e2ee_keys_user_trusted_idx" ON "e2ee_keys" ("user_id", "trusted_at");
