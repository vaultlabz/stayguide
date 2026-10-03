-- Initialize StayGuide Database with Sample Data

-- First run the main schema
SOURCE schema.sql;

-- Insert default super admin user (password: admin123)
-- Note: In production, this should be changed immediately
INSERT INTO users (email, password_hash, first_name, last_name, role, status) 
VALUES (
    'admin@stayguide.com', 
    '$2a$10$0aVSMGtGwqojteMJaEDN0e3ejGGIEl4dutZchscGebTG0suWdxzU2', 
    'Super', 
    'Admin', 
    'super_admin', 
    'active'
) ON DUPLICATE KEY UPDATE 
    password_hash = VALUES(password_hash),
    updated_at = CURRENT_TIMESTAMP;

-- Insert sample company for testing
INSERT INTO companies (name, slug, email, phone, address, connection_fee, monthly_fee_per_property, status) 
VALUES (
    'Demo Rentals LLC',
    'demo-rentals',
    'admin@demorentals.com',
    '+1-555-0123',
    '123 Main Street, Anytown, ST 12345',
    50.00,
    29.99,
    'active'
) ON DUPLICATE KEY UPDATE 
    name = VALUES(name),
    updated_at = CURRENT_TIMESTAMP;

-- Get the company ID for the sample company
SET @company_id = (SELECT id FROM companies WHERE slug = 'demo-rentals' LIMIT 1);

-- Insert sample company admin user (password: demo123)
INSERT INTO users (email, password_hash, first_name, last_name, role, company_id, status) 
VALUES (
    'admin@demorentals.com', 
    '$2a$10$Xu6U.GuHIL0SH2PIi/hAe.YnZhtohIUFnZXh3c7EWfZ6JFdMjbf2O', 
    'Demo', 
    'Admin', 
    'company_admin', 
    @company_id,
    'active'
) ON DUPLICATE KEY UPDATE 
    password_hash = VALUES(password_hash),
    company_id = VALUES(company_id),
    updated_at = CURRENT_TIMESTAMP;

-- Insert sample property
INSERT INTO properties (company_id, name, slug, address, description, wifi_name, wifi_password, check_in_instructions, check_out_instructions, house_rules, emergency_contact, status) 
VALUES (
    @company_id,
    'Seaside Villa',
    'seaside-villa',
    '456 Ocean Drive, Beach City, CA 90210',
    'Beautiful oceanfront villa with stunning views and modern amenities.',
    'SeasideVilla_Guest',
    'welcome2023',
    'Check-in is at 3:00 PM. The lockbox code is 1234. Keys are in the lockbox by the front door.',
    'Check-out is at 11:00 AM. Please leave keys in the lockbox and ensure all windows and doors are locked.',
    'No smoking indoors. No pets allowed. Quiet hours are 10 PM to 8 AM. Maximum 6 guests.',
    'Emergency Contact: Property Manager - (555) 123-4567',
    'active'
) ON DUPLICATE KEY UPDATE 
    name = VALUES(name),
    updated_at = CURRENT_TIMESTAMP;

-- Get the property ID for sample data
SET @property_id = (SELECT id FROM properties WHERE company_id = @company_id AND slug = 'seaside-villa' LIMIT 1);

-- Insert property content
INSERT INTO property_content (property_id, welcome_message, weather_widget) 
VALUES (
    @property_id,
    'Welcome to Seaside Villa! We hope you have a wonderful stay. Please explore our local recommendations and don''t hesitate to contact us if you need anything.',
    true
) ON DUPLICATE KEY UPDATE 
    welcome_message = VALUES(welcome_message),
    updated_at = CURRENT_TIMESTAMP;

-- Insert sample restaurants
INSERT INTO restaurants (property_id, name, image_url, rating, distance, category, google_maps_url, description, display_order, status) 
VALUES 
(
    @property_id,
    'Ocean Breeze Café',
    'https://example.com/ocean-cafe.jpg',
    4.5,
    '0.2 miles',
    'breakfast',
    'https://maps.google.com/?q=Ocean+Breeze+Cafe',
    'Fantastic breakfast spot with ocean views. Try their famous pancakes!',
    1,
    'active'
),
(
    @property_id,
    'Coastal Bistro',
    'https://example.com/coastal-bistro.jpg',
    4.7,
    '0.5 miles',
    'dinner',
    'https://maps.google.com/?q=Coastal+Bistro',
    'Upscale dining with fresh seafood and local ingredients.',
    2,
    'active'
),
(
    @property_id,
    'Beach Bar & Grill',
    'https://example.com/beach-bar.jpg',
    4.3,
    '0.3 miles',
    'drinks',
    'https://maps.google.com/?q=Beach+Bar+Grill',
    'Casual beachside bar with great cocktails and sunset views.',
    3,
    'active'
) ON DUPLICATE KEY UPDATE 
    name = VALUES(name),
    updated_at = CURRENT_TIMESTAMP;

-- Insert sample how-to videos
INSERT INTO howto_videos (property_id, title, video_url, thumbnail_url, description, display_order, status) 
VALUES 
(
    @property_id,
    'How to Use the Smart Lock',
    'https://youtube.com/watch?v=demo1',
    'https://example.com/smart-lock-thumb.jpg',
    'Quick tutorial on using the electronic door lock system.',
    1,
    'active'
),
(
    @property_id,
    'WiFi and Entertainment Setup',
    'https://youtube.com/watch?v=demo2',
    'https://example.com/wifi-thumb.jpg',
    'Learn how to connect to WiFi and use the smart TV and streaming services.',
    2,
    'active'
),
(
    @property_id,
    'Pool and Hot Tub Instructions',
    'https://youtube.com/watch?v=demo3',
    'https://example.com/pool-thumb.jpg',
    'Safety instructions and operating procedures for the pool and spa.',
    3,
    'active'
) ON DUPLICATE KEY UPDATE 
    title = VALUES(title),
    updated_at = CURRENT_TIMESTAMP;

-- Insert sample local info
INSERT INTO local_info (property_id, category, title, description, address, phone, website_url, google_maps_url, display_order, status) 
VALUES 
(
    @property_id,
    'attractions',
    'Beach City Pier',
    'Historic pier with fishing, shops, and restaurants. Great for sunset walks.',
    '789 Pier Road, Beach City, CA 90210',
    '(555) 987-6543',
    'https://beachcitypier.com',
    'https://maps.google.com/?q=Beach+City+Pier',
    1,
    'active'
),
(
    @property_id,
    'grocery',
    'Seaside Market',
    'Full-service grocery store with fresh produce, deli, and bakery.',
    '321 Coastal Blvd, Beach City, CA 90210',
    '(555) 456-7890',
    'https://seasidemarket.com',
    'https://maps.google.com/?q=Seaside+Market',
    1,
    'active'
),
(
    @property_id,
    'emergency',
    'Beach City Hospital',
    '24-hour emergency room and urgent care facility.',
    '555 Medical Center Dr, Beach City, CA 90210',
    '(555) 911-1234',
    'https://beachcityhospital.com',
    'https://maps.google.com/?q=Beach+City+Hospital',
    1,
    'active'
) ON DUPLICATE KEY UPDATE 
    title = VALUES(title),
    updated_at = CURRENT_TIMESTAMP;

-- Insert sample announcement
INSERT INTO announcements (property_id, title, message, type, scheduled_start, scheduled_end, status, created_by) 
VALUES (
    @property_id,
    'Weekly Cleaning Schedule',
    'Pool cleaning service will be performed every Wednesday from 9:00 AM to 11:00 AM. Pool will be temporarily unavailable during this time.',
    'info',
    CURRENT_TIMESTAMP,
    DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY),
    'active',
    (SELECT id FROM users WHERE email = 'admin@demorentals.com' LIMIT 1)
) ON DUPLICATE KEY UPDATE 
    message = VALUES(message),
    updated_at = CURRENT_TIMESTAMP;

COMMIT;