-- Signal's ProtocolAddress uses a numeric device id. Keep it distinct from
-- the app's UUID device id and unique within an account.
ALTER TABLE "e2ee_signal_devices"
  ADD COLUMN IF NOT EXISTS "protocol_device_id" integer;

CREATE UNIQUE INDEX IF NOT EXISTS "e2ee_signal_devices_protocol_address_unique"
  ON "e2ee_signal_devices" ("user_id", "protocol_device_id")
  WHERE "protocol_device_id" IS NOT NULL;
