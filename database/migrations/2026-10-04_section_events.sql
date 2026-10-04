-- 2026-10-04 00:26, G4 section analytics (no IP / user agent stored)
CREATE TABLE section_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    property_id INT NOT NULL,
    source ENUM('tablet', 'guest_link') NOT NULL,
    device_id INT NULL,
    section VARCHAR(20) NOT NULL,
    action VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    INDEX idx_property_created (property_id, created_at)
);
