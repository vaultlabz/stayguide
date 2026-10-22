-- 2026-10-08 07:10, G7 Ops stage 6: vendor profiles with the insurance certificate (COI) and its expiry
-- Apply after 2026-10-08_ops_offline_push.sql (see README.md). Plan: docs/G7_OPS_PLAN.md

-- One profile per worker account (a vendor working for several companies keeps one certificate)
CREATE TABLE vendor_profiles (
    user_id INT PRIMARY KEY,
    business_name VARCHAR(160) NULL,
    license_no VARCHAR(80) NULL,
    insurance_provider VARCHAR(120) NULL,
    coi_path VARCHAR(255) NULL,          -- private file under OPS_STORAGE_DIR/coi (PDF or re-encoded image)
    coi_mime VARCHAR(40) NULL,
    coi_uploaded_at TIMESTAMP NULL,
    coi_expires_on DATE NULL,
    coi_verified_by INT NULL,            -- a manager looked at the file and confirmed the date
    coi_verified_at TIMESTAMP NULL,
    coi_alert_level ENUM('none', '30', '7', 'expired') NOT NULL DEFAULT 'none', -- last expiry reminder sent (reset when the date changes)
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (coi_verified_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_expiry (coi_expires_on)
);
