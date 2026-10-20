-- Signal uses unsigned 32-bit IDs; PostgreSQL integer is signed 32-bit.
-- Widen storage without changing any existing key material or identifiers.
ALTER TABLE e2ee_signal_prekeys ALTER COLUMN key_id TYPE bigint;
