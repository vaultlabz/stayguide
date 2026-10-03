-- 2026-10-03 11:39, paired in-home devices (tablets now; sensors etc. later via type)
CREATE TABLE devices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    property_id INT NOT NULL,
    type ENUM('tablet') NOT NULL DEFAULT 'tablet',
    name VARCHAR(100),
    token_hash CHAR(64) NULL,
    pairing_code CHAR(6) NULL,
    pairing_expires_at TIMESTAMP NULL,
    last_seen_at TIMESTAMP NULL,
    status ENUM('pending', 'active', 'revoked') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    UNIQUE KEY unique_token_hash (token_hash),
    INDEX idx_pairing_code (pairing_code, status),
    INDEX idx_property_status (property_id, status)
);
