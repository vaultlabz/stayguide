-- 2026-10-10 10:18, #62 presence at the property: GPS stamped on crew check-in/out (distance from the property),
-- a precise property spot (separate from the city-level weather coordinates), late / no-show alerts, arrived/left
-- emails switch, and an anonymous on-site flag for guest guide opens. Apply after 2026-10-09_password_resets.sql.
ALTER TABLE companies ADD COLUMN presence_emails BOOLEAN NOT NULL DEFAULT TRUE AFTER timezone;
ALTER TABLE properties
    ADD COLUMN site_lat DECIMAL(9,6) NULL AFTER longitude,
    ADD COLUMN site_lng DECIMAL(9,6) NULL AFTER site_lat,
    ADD COLUMN site_source ENUM('pin', 'qr') NULL AFTER site_lng,
    ADD COLUMN guide_location_check BOOLEAN NOT NULL DEFAULT FALSE AFTER guest_link_show_wifi;
ALTER TABLE time_entries
    ADD COLUMN lat_in DECIMAL(9,6) NULL AFTER void_reason,
    ADD COLUMN lng_in DECIMAL(9,6) NULL AFTER lat_in,
    ADD COLUMN acc_in SMALLINT UNSIGNED NULL AFTER lng_in,
    ADD COLUMN dist_in INT UNSIGNED NULL AFTER acc_in,
    ADD COLUMN lat_out DECIMAL(9,6) NULL AFTER dist_in,
    ADD COLUMN lng_out DECIMAL(9,6) NULL AFTER lat_out,
    ADD COLUMN acc_out SMALLINT UNSIGNED NULL AFTER lng_out,
    ADD COLUMN dist_out INT UNSIGNED NULL AFTER acc_out;
ALTER TABLE work_orders ADD COLUMN late_alerted_at TIMESTAMP NULL AFTER unassigned_alerted_at;
ALTER TABLE section_events ADD COLUMN on_site BOOLEAN NULL AFTER action;
