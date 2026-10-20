-- Signal-protocol public directory.  This table family intentionally contains
-- public keys only: device-private identity keys and ratchet state must never
-- be uploaded to the application server.

CREATE TABLE IF NOT EXISTS "e2ee_signal_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "device_id" text NOT NULL,
  "protocol_version" integer NOT NULL DEFAULT 2,
  "registration_id" integer NOT NULL,
  "identity_key" text NOT NULL,
  "signing_key" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_seen_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "e2ee_signal_devices_user_device_unique" UNIQUE ("user_id", "device_id")
);

CREATE TABLE IF NOT EXISTS "e2ee_signal_prekeys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "device_id" text NOT NULL,
  "key_id" integer NOT NULL,
  "kind" text NOT NULL,
  "public_key" text NOT NULL,
  "signature" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone,
  "consumed_at" timestamp with time zone,
  CONSTRAINT "e2ee_signal_prekeys_kind_check" CHECK ("kind" IN ('signed', 'one_time')),
  CONSTRAINT "e2ee_signal_prekeys_signature_check" CHECK (
    ("kind" = 'signed' AND "signature" IS NOT NULL) OR
    ("kind" = 'one_time' AND "signature" IS NULL)
  ),
  CONSTRAINT "e2ee_signal_prekeys_device_key_unique" UNIQUE ("user_id", "device_id", "key_id")
);

CREATE INDEX IF NOT EXISTS "e2ee_signal_devices_active_idx"
  ON "e2ee_signal_devices" ("user_id", "revoked_at");
CREATE INDEX IF NOT EXISTS "e2ee_signal_prekeys_available_idx"
  ON "e2ee_signal_prekeys" ("user_id", "device_id", "kind", "consumed_at", "expires_at");
