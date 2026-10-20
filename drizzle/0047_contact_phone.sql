-- User-provided discovery data is deliberately separate from verified identity.
ALTER TABLE users ADD COLUMN contact_phone text;
DROP INDEX users_discoverable_phone_idx;
CREATE INDEX users_discoverable_phone_idx ON users(coalesce(contact_phone, verified_phone)) WHERE phone_discoverable;
