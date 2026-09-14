-- Signed prekeys and one-time prekeys have independent ID spaces.
ALTER TABLE "e2ee_signal_prekeys"
  DROP CONSTRAINT IF EXISTS "e2ee_signal_prekeys_device_key_unique";
ALTER TABLE "e2ee_signal_prekeys"
  ADD CONSTRAINT "e2ee_signal_prekeys_device_kind_key_unique"
  UNIQUE ("user_id", "device_id", "kind", "key_id");
