-- 2026-10-08 08:20, #33 clearer pairing errors: remember which code paired a tablet, so a reused code can be told apart
-- from a mistyped one. Apply after 2026-10-08_ops_schedules.sql (see README.md).
ALTER TABLE devices ADD COLUMN used_pairing_code CHAR(6) NULL, ADD COLUMN paired_at TIMESTAMP NULL, ADD INDEX idx_used_code (used_pairing_code);
