-- 2026-10-03 22:42, G2 free-tier phone/web guide link
ALTER TABLE properties
    ADD COLUMN guest_link_token VARCHAR(64) NULL,
    ADD COLUMN guest_link_show_wifi BOOLEAN NOT NULL DEFAULT TRUE,
    ADD UNIQUE KEY unique_guest_link_token (guest_link_token);

-- Where a guest report came from
ALTER TABLE guest_reports
    ADD COLUMN source ENUM('tablet', 'guest_link') NOT NULL DEFAULT 'tablet' AFTER urgency_level;

-- Taps on guest-link buttons (phones can't scan their own screen)
ALTER TABLE link_clicks
    MODIFY COLUMN medium ENUM('qr', 'tablet', 'guest_link') NOT NULL DEFAULT 'qr';
