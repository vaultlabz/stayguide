-- 2026-10-03 12:32, Phase 5: direct-booking / review links on the tablet + click tracking
ALTER TABLE properties
    ADD COLUMN direct_booking_url VARCHAR(500) NULL AFTER main_image_url,
    ADD COLUMN review_url VARCHAR(500) NULL AFTER direct_booking_url,
    ADD COLUMN return_guest_offer VARCHAR(255) NULL AFTER review_url,
    ADD COLUMN guest_checkout_date DATE NULL AFTER return_guest_offer;

CREATE TABLE link_clicks (
    id CHAR(16) PRIMARY KEY,                    -- also sent to the owner's site as sg_click
    property_id INT NOT NULL,                   -- property whose tablet showed the link
    kind ENUM('book', 'review', 'showcase') NOT NULL,
    target_property_id INT NULL,                -- for showcase links
    medium ENUM('qr', 'tablet') NOT NULL DEFAULT 'qr',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    INDEX idx_property_created (property_id, created_at)
);
