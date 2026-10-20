-- Every new sign-in explicitly starts restricted. Only device-private-key
-- proof can clear the flag. Existing active sessions without a trusted binding
-- must also finish verification; no encryption keys or account data are removed.
ALTER TABLE device_sessions ADD COLUMN approval_required boolean NOT NULL DEFAULT true;
UPDATE device_sessions s SET approval_required=false
WHERE EXISTS (SELECT 1 FROM e2ee_keys k WHERE k.user_id=s.user_id
    AND k.session_id=s.id AND k.trusted_at IS NOT NULL);
