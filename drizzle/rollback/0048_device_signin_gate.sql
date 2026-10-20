-- Roll back application code before removing the persisted approval state.
ALTER TABLE device_sessions DROP COLUMN approval_required;
