-- 2026-10-03 17:14, tablet background style: solid, custom image, or one of 8 gradient presets; existing properties that already have a background image keep it
ALTER TABLE properties
    ADD COLUMN tablet_background ENUM('solid', 'image', 'manhattan-ice', 'apricot-storm', 'barley-titan', 'silver-cloud', 'erie-charcoal', 'burnham-stone', 'baltic-rose', 'rich-bistre') NOT NULL DEFAULT 'solid' AFTER background_image_url;
UPDATE properties SET tablet_background = 'image' WHERE background_image_url IS NOT NULL AND background_image_url <> '';
