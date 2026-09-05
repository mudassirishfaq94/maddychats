-- Custom chat background focal point (drag-to-position).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS background_position_x integer DEFAULT 50;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS background_position_y integer DEFAULT 50;
