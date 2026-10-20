-- Additive policy defaults: members may add; group identity remains admin-controlled until changed.
ALTER TABLE conversations ADD COLUMN admin_only_adding_members boolean NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN admin_only_editing_info boolean NOT NULL DEFAULT true;
-- Rollback: disable member mutation paths first, then drop these two columns. No encryption data changes.
