-- 2026-10-08 00:10, G7 Ops stage 3: encrypted access codes, property QR stickers, private job photos, time entries (check-in/out)
-- Apply after 2026-10-07_ops_work_orders.sql (see README.md). Plan: docs/G7_OPS_PLAN.md

ALTER TABLE work_orders ADD COLUMN access_code_override_enc TEXT NULL; -- per-job code; never selected into API responses

-- Access codes live in their own table so no property query (dashboard, tablet, guest link) can ever return them
CREATE TABLE property_access (
    property_id INT PRIMARY KEY,
    access_code_enc TEXT NULL, -- AES-256-GCM (OPS_SECRET_KEY)
    access_notes VARCHAR(500) NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- One active sticker per property; token_hash for lookups, token_enc so the manager can reprint it
CREATE TABLE property_qr_tokens (
    id INT PRIMARY KEY AUTO_INCREMENT,
    property_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    token_enc TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP NULL,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    INDEX idx_property (property_id)
);

-- Files live under storage/ops (not public); served only through signed, short-lived URLs
CREATE TABLE work_order_photos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    work_order_id INT NOT NULL,
    kind ENUM('before', 'after', 'step', 'receipt') NOT NULL DEFAULT 'after',
    path VARCHAR(255) NOT NULL,
    caption VARCHAR(255) NULL,
    uploaded_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_order (work_order_id)
);

-- On-site time (QR or button); stage 7 adds review/edits and pay export
CREATE TABLE time_entries (
    id INT PRIMARY KEY AUTO_INCREMENT,
    work_order_id INT NOT NULL,
    user_id INT NOT NULL,
    clock_in DATETIME NOT NULL,
    clock_out DATETIME NULL,
    method_in ENUM('qr', 'button') NOT NULL,
    method_out ENUM('qr', 'button', 'submit', 'system') NULL, -- system = job canceled/reassigned while on site
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_open (user_id, clock_out),
    INDEX idx_order (work_order_id)
);
