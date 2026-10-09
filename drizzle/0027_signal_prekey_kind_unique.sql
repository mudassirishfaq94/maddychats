-- Signed prekeys and one-time prekeys have independent ID spaces.
ALTER TABLE "e2ee_signal_prekeys"
  DROP CONSTRAINT IF EXISTS "e2ee_signal_prekeys_device_key_unique";
DO $$
DECLARE existing_columns text[];
BEGIN
  SELECT ARRAY(
    SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ordinal)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    ORDER BY k.ordinal
  ) INTO existing_columns
  FROM pg_constraint c
  WHERE c.conrelid = 'public.e2ee_signal_prekeys'::regclass
    AND c.conname = 'e2ee_signal_prekeys_device_kind_key_unique'
    AND c.contype = 'u';
  IF existing_columns IS NULL THEN
    ALTER TABLE "e2ee_signal_prekeys"
      ADD CONSTRAINT "e2ee_signal_prekeys_device_kind_key_unique"
      UNIQUE ("user_id", "device_id", "kind", "key_id");
  ELSIF existing_columns IS DISTINCT FROM ARRAY['user_id', 'device_id', 'kind', 'key_id']::text[] THEN
    RAISE EXCEPTION 'Incompatible existing Signal prekey uniqueness constraint';
  END IF;
END $$;
