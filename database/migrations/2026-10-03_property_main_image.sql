-- 2026-10-03 11:34, add properties.main_image_url (dashboard already sends it; column was missing from schema)
ALTER TABLE properties ADD COLUMN main_image_url VARCHAR(500) NULL AFTER emergency_contact;
