-- 2026-10-22 11:01, #63 Terms of Service + Privacy Policy acceptance recorded per account at signup.
-- Apply after 2026-10-10_presence.sql.
ALTER TABLE users
    ADD COLUMN terms_accepted_at TIMESTAMP NULL AFTER password_changed_at,
    ADD COLUMN terms_version VARCHAR(20) NULL AFTER terms_accepted_at;
