-- 2026-10-03 17:00, tablet home screen: weather location, temperature unit and clock format
ALTER TABLE properties
    ADD COLUMN latitude DECIMAL(9,6) NULL AFTER background_image_url,
    ADD COLUMN longitude DECIMAL(9,6) NULL AFTER latitude,
    ADD COLUMN temperature_unit ENUM('F', 'C') NOT NULL DEFAULT 'F' AFTER longitude,
    ADD COLUMN clock_format ENUM('12h', '24h') NOT NULL DEFAULT '12h' AFTER temperature_unit;
