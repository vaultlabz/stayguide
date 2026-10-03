-- 2026-10-03 16:42, tablet background style; existing properties that already have a background image keep it
ALTER TABLE properties
    ADD COLUMN tablet_background ENUM('solid', 'baltic-rose', 'rich-bistre', 'image') NOT NULL DEFAULT 'solid' AFTER background_image_url;
UPDATE properties SET tablet_background = 'image' WHERE background_image_url IS NOT NULL AND background_image_url <> '';
