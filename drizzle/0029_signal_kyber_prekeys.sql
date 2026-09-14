ALTER TABLE "e2ee_signal_prekeys"
  DROP CONSTRAINT IF EXISTS "e2ee_signal_prekeys_kind_check";
ALTER TABLE "e2ee_signal_prekeys"
  ADD CONSTRAINT "e2ee_signal_prekeys_kind_check" CHECK ("kind" IN ('signed', 'one_time', 'kyber'));
ALTER TABLE "e2ee_signal_prekeys"
  DROP CONSTRAINT IF EXISTS "e2ee_signal_prekeys_signature_check";
ALTER TABLE "e2ee_signal_prekeys"
  ADD CONSTRAINT "e2ee_signal_prekeys_signature_check" CHECK (
    ("kind" IN ('signed', 'kyber') AND "signature" IS NOT NULL) OR
    ("kind" = 'one_time' AND "signature" IS NULL)
  );
