-- 2026-10-03 15:29, per-property tablet appearance (theme + custom background image)
ALTER TABLE properties
    ADD COLUMN tablet_theme ENUM('auto', 'light', 'dark') NOT NULL DEFAULT 'auto' AFTER guest_checkout_date,
    ADD COLUMN background_image_url VARCHAR(500) NULL AFTER tablet_theme;
