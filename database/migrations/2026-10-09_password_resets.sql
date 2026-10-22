-- 2026-10-09 12:11, #56 password reset + change: single-use emailed reset links (stored as SHA-256) and a per-user
-- password_changed_at that signs out sessions issued before a reset/change. Apply after 2026-10-08_device_pairing_reasons.sql.
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP NULL AFTER last_login;
CREATE TABLE password_resets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_reset_token (token_hash),
    INDEX idx_reset_user (user_id, created_at)
);
