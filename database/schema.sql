-- StayGuide Multi-Tenant SaaS Database Schema

-- Companies table (main tenants)
CREATE TABLE companies (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    address TEXT,
    logo_url VARCHAR(500),
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    connection_fee DECIMAL(10,2) DEFAULT 0.00,
    monthly_fee_per_property DECIMAL(10,2) DEFAULT 0.00,
    plan ENUM('free', 'pro', 'portfolio') NOT NULL DEFAULT 'free', -- 2026-10-03 23:06, G3 billing
    ops_addon BOOLEAN NOT NULL DEFAULT false, -- 2026-10-07 18:30, G7 S1 Ops add-on
    ops_approval_threshold DECIMAL(10,2) NULL DEFAULT 250.00, -- 2026-10-07 22:10, G7 S2 (NULL = never ask)
    timezone VARCHAR(64) NOT NULL DEFAULT 'America/Denver', -- 2026-10-08 10:30, G7 S8 (schedules, local times)
    presence_emails BOOLEAN NOT NULL DEFAULT TRUE, -- 2026-10-10 10:18, #62 arrived/left emails
    billing_interval ENUM('month', 'year') NULL,
    subscription_status VARCHAR(32) NULL,
    stripe_customer_id VARCHAR(64) NULL,
    stripe_subscription_id VARCHAR(64) NULL,
    current_period_end TIMESTAMP NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_stripe_customer (stripe_customer_id), -- 2026-10-08 11:30, #45: index named as in the migration so fresh installs and migrated databases match
    INDEX idx_slug (slug),
    INDEX idx_status (status)
);

-- Users table (admins and company users)
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role ENUM('super_admin', 'company_admin', 'field_worker') NOT NULL, -- 2026-10-07 18:30, G7 S1
    company_id INT NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    last_login TIMESTAMP NULL,
    password_changed_at TIMESTAMP NULL, -- 2026-10-09 12:11, #56 sessions issued before this are rejected
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_company_role (company_id, role)
);

-- Properties table
CREATE TABLE properties (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    address TEXT,
    description TEXT,
    wifi_name VARCHAR(100),
    wifi_password VARCHAR(100),
    check_in_instructions TEXT,
    check_out_instructions TEXT,
    house_rules TEXT,
    emergency_contact VARCHAR(100),
    main_image_url VARCHAR(500), -- 2026-10-03 11:34, added (dashboard sends it)
    direct_booking_url VARCHAR(500), -- 2026-10-03 12:32, Phase 5 guest links
    review_url VARCHAR(500),
    return_guest_offer VARCHAR(255),
    guest_checkout_date DATE NULL, -- current guest's checkout (manual until stays sync exists)
    tablet_theme ENUM('auto', 'light', 'dark') NOT NULL DEFAULT 'auto', -- 2026-10-03 15:29, tablet look (set by property manager)
    background_image_url VARCHAR(500) NULL,
    latitude DECIMAL(9,6) NULL, -- 2026-10-03 17:00, weather location
    longitude DECIMAL(9,6) NULL,
    site_lat DECIMAL(9,6) NULL, -- 2026-10-10 10:18, #62 precise spot for crew check-in distance (pin by manager or learned from a QR check-in)
    site_lng DECIMAL(9,6) NULL,
    site_source ENUM('pin', 'qr') NULL,
    temperature_unit ENUM('F', 'C') NOT NULL DEFAULT 'F',
    clock_format ENUM('12h', '24h') NOT NULL DEFAULT '12h',
    tablet_background ENUM('solid', 'image', 'manhattan-ice', 'apricot-storm', 'barley-titan', 'silver-cloud', 'erie-charcoal', 'burnham-stone', 'baltic-rose', 'rich-bistre') NOT NULL DEFAULT 'solid', -- 2026-10-03 16:42
    guest_link_token VARCHAR(64) NULL, -- 2026-10-03 22:42, G2 public guide link
    guest_link_show_wifi BOOLEAN NOT NULL DEFAULT TRUE,
    guide_location_check BOOLEAN NOT NULL DEFAULT FALSE, -- 2026-10-10 10:18, #62 phone guide asks guests for location (stored only as on-site yes/no)
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE KEY unique_company_slug (company_id, slug),
    UNIQUE KEY unique_guest_link_token (guest_link_token), -- 2026-10-08 11:30, #45: index named as in the migration so fresh installs and migrated databases match
    INDEX idx_company_status (company_id, status)
);

-- Property content (welcome messages, local info, etc.)
CREATE TABLE property_content (
    id INT PRIMARY KEY AUTO_INCREMENT,
    property_id INT NOT NULL,
    welcome_message TEXT,
    weather_widget BOOLEAN DEFAULT true,
    custom_css TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);

-- Restaurant/Food recommendations
CREATE TABLE restaurants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    property_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    image_url VARCHAR(500),
    rating DECIMAL(3,2),
    distance VARCHAR(50),
    category ENUM('breakfast', 'lunch', 'dinner', 'drinks', 'all') DEFAULT 'all',
    google_maps_url TEXT,
    description TEXT,
    display_order INT DEFAULT 0,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    INDEX idx_property_category (property_id, category),
    INDEX idx_display_order (display_order)
);

-- How-to videos
CREATE TABLE howto_videos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    property_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    video_url VARCHAR(500) NOT NULL,
    thumbnail_url VARCHAR(500),
    description TEXT,
    display_order INT DEFAULT 0,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    INDEX idx_property_order (property_id, display_order)
);

-- Local area information
CREATE TABLE local_info (
    id INT PRIMARY KEY AUTO_INCREMENT,
    property_id INT NOT NULL,
    category ENUM('attractions', 'emergency', 'grocery', 'pharmacy', 'transportation', 'other') NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    address TEXT,
    phone VARCHAR(50),
    website_url VARCHAR(500),
    google_maps_url TEXT,
    display_order INT DEFAULT 0,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    INDEX idx_property_category (property_id, category)
);

-- Announcements/Notifications
CREATE TABLE announcements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    property_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('info', 'warning', 'urgent') DEFAULT 'info',
    scheduled_start TIMESTAMP NULL,
    scheduled_end TIMESTAMP NULL,
    status ENUM('draft', 'active', 'inactive', 'expired') DEFAULT 'draft',
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_property_status (property_id, status),
    INDEX idx_scheduled (scheduled_start, scheduled_end)
);

-- Other properties showcase
CREATE TABLE showcase_properties (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    image_url VARCHAR(500),
    location VARCHAR(255),
    description TEXT,
    booking_url VARCHAR(500),
    contact_info VARCHAR(255),
    display_order INT DEFAULT 0,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    INDEX idx_company_order (company_id, display_order)
);

-- Billing records
CREATE TABLE billing (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    connection_fee DECIMAL(10,2) DEFAULT 0.00,
    property_count INT NOT NULL DEFAULT 0,
    monthly_fee_per_property DECIMAL(10,2) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status ENUM('pending', 'paid', 'overdue', 'cancelled') DEFAULT 'pending',
    invoice_number VARCHAR(100) UNIQUE,
    paid_at TIMESTAMP NULL,
    stripe_payment_intent_id VARCHAR(255) NULL, -- 2026-10-03 23:06 (code used it; column was missing)
    stripe_customer_id VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    INDEX idx_company_period (company_id, billing_period_start),
    INDEX idx_status (status)
);

-- Helpdesk tickets
CREATE TABLE helpdesk_tickets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    created_by INT NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    status ENUM('open', 'in_progress', 'resolved', 'closed') DEFAULT 'open',
    assigned_to INT NULL,
    resolved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id),
    INDEX idx_company_status (company_id, status),
    INDEX idx_priority (priority)
);

-- Amenities table (Property amenities and features)
CREATE TABLE amenities (
    id INT PRIMARY KEY AUTO_INCREMENT,
    property_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    image_url VARCHAR(500),
    category ENUM('recreation', 'comfort', 'kitchen', 'location', 'technology', 'safety', 'general') DEFAULT 'general',
    display_order INT DEFAULT 0,
    status ENUM('active', 'inactive') DEFAULT 'active',
    
    -- Super Admin Control Fields
    created_by INT NULL, -- References users.id (tracks who created)
    approved_by_admin INT NULL, -- References users.id (Super Admin approval)
    is_admin_managed BOOLEAN DEFAULT false, -- Super Admin control flag
    template_id INT NULL, -- Reference to global templates
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (approved_by_admin) REFERENCES users(id),
    INDEX idx_property_category (property_id, category),
    INDEX idx_display_order (display_order),
    INDEX idx_admin_managed (is_admin_managed),
    INDEX idx_status (status)
);

-- Global Amenity Templates for Super Admin Standardization
CREATE TABLE global_amenity_templates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    category ENUM('recreation', 'comfort', 'kitchen', 'location', 'technology', 'safety', 'general') NOT NULL,
    is_standard BOOLEAN DEFAULT false, -- Super Admin can mark as required
    created_by INT NOT NULL, -- Must be super_admin
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_category (category),
    INDEX idx_standard (is_standard)
);

-- Guest Reports Table for Tablet App Submissions
CREATE TABLE guest_reports (
    id INT PRIMARY KEY AUTO_INCREMENT,
    property_id INT NOT NULL,
    amenity_id INT NULL, -- Link to specific amenity if report is about amenity
    guest_name VARCHAR(255),
    guest_room VARCHAR(50),
    guest_phone VARCHAR(50),
    category ENUM('maintenance', 'supplies', 'housekeeping', 'amenities', 'wifi_tech', 'noise_complaint', 'other') NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    status ENUM('new', 'acknowledged', 'in_progress', 'resolved', 'closed') DEFAULT 'new',
    location VARCHAR(255), -- e.g., "Kitchen", "Bathroom", "Living Room", "Pool Area"
    urgency_level ENUM('not_urgent', 'same_day', 'immediate') DEFAULT 'not_urgent',
    source ENUM('tablet', 'guest_link') NOT NULL DEFAULT 'tablet', -- 2026-10-03 22:42
    guest_ip VARCHAR(45), -- For tracking/analytics
    resolved_at TIMESTAMP NULL,
    resolved_by INT NULL, -- References users.id when resolved
    resolution_notes TEXT,
    admin_notified BOOLEAN DEFAULT false, -- Super Admin notification flag
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (amenity_id) REFERENCES amenities(id) ON DELETE SET NULL,
    FOREIGN KEY (resolved_by) REFERENCES users(id),
    INDEX idx_property_status (property_id, status),
    INDEX idx_category_priority (category, priority),
    INDEX idx_amenity_reports (amenity_id),
    INDEX idx_admin_notified (admin_notified),
    INDEX idx_created_at (created_at),
    INDEX idx_urgency (urgency_level)
);

-- System Audit Log for All Changes (Super Admin, Company Admin, Guest actions)
CREATE TABLE system_audit_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    table_name VARCHAR(100) NOT NULL,
    record_id INT NOT NULL,
    action ENUM('created', 'updated', 'deleted', 'bulk_applied', 'template_applied') NOT NULL,
    changed_by INT NULL, -- NULL for guest actions
    user_type ENUM('super_admin', 'company_admin', 'guest') NOT NULL,
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    notes TEXT, -- Additional context
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (changed_by) REFERENCES users(id),
    INDEX idx_table_record (table_name, record_id),
    INDEX idx_changed_by (changed_by),
    INDEX idx_user_type (user_type),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
);

-- Helpdesk ticket responses
CREATE TABLE helpdesk_responses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    ticket_id INT NOT NULL,
    user_id INT NOT NULL,
    message TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (ticket_id) REFERENCES helpdesk_tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_ticket_created (ticket_id, created_at)
);

-- Analytics/Usage tracking
CREATE TABLE analytics (
    id INT PRIMARY KEY AUTO_INCREMENT,
    property_id INT NOT NULL,
    event_type ENUM('page_view', 'screen_visit', 'link_click', 'video_play') NOT NULL,
    event_data JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    INDEX idx_property_event (property_id, event_type),
    INDEX idx_created_at (created_at)
);

-- Insert default super admin user
INSERT INTO users (email, password_hash, first_name, last_name, role, status) 
VALUES ('admin@stayguide.com', '$2a$10$dummy.hash.will.be.replaced', 'Super', 'Admin', 'super_admin', 'active');
-- 2026-10-03 11:39, paired in-home devices (tablets now; sensors etc. later via type)
CREATE TABLE devices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    property_id INT NOT NULL,
    type ENUM('tablet') NOT NULL DEFAULT 'tablet',
    name VARCHAR(100),
    token_hash CHAR(64) NULL,
    pairing_code CHAR(6) NULL,
    pairing_expires_at TIMESTAMP NULL,
    used_pairing_code CHAR(6) NULL, -- 2026-10-08 08:20, #33: tells a reused code from a mistyped one
    paired_at TIMESTAMP NULL,
    last_seen_at TIMESTAMP NULL,
    status ENUM('pending', 'active', 'revoked') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    UNIQUE KEY unique_token_hash (token_hash),
    INDEX idx_pairing_code (pairing_code, status),
    INDEX idx_used_code (used_pairing_code),
    INDEX idx_property_status (property_id, status)
);

-- 2026-10-03 12:32, direct-booking / review link clicks (id doubles as sg_click)
CREATE TABLE link_clicks (
    id CHAR(16) PRIMARY KEY,
    property_id INT NOT NULL,
    kind ENUM('book', 'review', 'showcase') NOT NULL,
    target_property_id INT NULL,
    medium ENUM('qr', 'tablet', 'guest_link') NOT NULL DEFAULT 'qr', -- 2026-10-03 22:42 guest_link added
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    INDEX idx_property_created (property_id, created_at)
);

-- 2026-10-03 23:06, G3 Stripe webhook idempotency + hardware orders
CREATE TABLE stripe_events (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(100) NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hardware_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    kit ENUM('desk', 'wall') NOT NULL,
    mode ENUM('purchase', 'bundle') NOT NULL,
    status ENUM('pending', 'paid', 'shipped', 'cancelled') NOT NULL DEFAULT 'pending',
    stripe_checkout_session_id VARCHAR(255) NULL UNIQUE,
    amount_total DECIMAL(10,2) NULL,
    shipping_details TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    INDEX idx_status (status)
);

-- 2026-10-04 00:26, G4 section analytics (privacy-light: no IP / user agent). The older `analytics` table above is unused.
CREATE TABLE section_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    property_id INT NOT NULL,
    source ENUM('tablet', 'guest_link') NOT NULL,
    device_id INT NULL,
    section VARCHAR(20) NOT NULL,
    action VARCHAR(20) NOT NULL,
    on_site BOOLEAN NULL, -- 2026-10-10 10:18, #62 guest guide: at the property yes/no (only when the property asks)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    INDEX idx_property_created (property_id, created_at)
);

-- 2026-10-07 18:30, G7 Ops stage 1 (same as migrations/2026-10-07_ops_foundations.sql)
-- One worker account can belong to several companies; each company sees only its own workers and jobs
CREATE TABLE company_workers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    user_id INT NOT NULL,
    worker_type ENUM('tech', 'cleaner', 'contractor', 'vendor') NOT NULL,
    status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
    skills JSON NULL,
    phone VARCHAR(50) NULL,
    hourly_rate DECIMAL(8,2) NULL,
    invited_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_company_user (company_id, user_id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user (user_id)
);

-- Invite links: only the SHA-256 of the token is stored
CREATE TABLE worker_invites (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(50) NULL,
    worker_type ENUM('tech', 'cleaner', 'contractor', 'vendor') NOT NULL,
    skills JSON NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP NULL,
    revoked_at TIMESTAMP NULL,
    invited_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_company_email (company_id, email)
);

-- One-time email sign-in codes (HMAC of the code, 10 minutes, 5 attempts)
CREATE TABLE login_codes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    code_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_created (user_id, created_at)
);

-- 2026-10-07 22:10, G7 Ops stage 2 (same as migrations/2026-10-07_ops_work_orders.sql)
CREATE TABLE work_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    property_id INT NOT NULL,
    amenity_id INT NULL,
    guest_report_id INT NULL,
    type ENUM('maintenance', 'cleaning', 'inspection', 'ad_hoc') NOT NULL DEFAULT 'maintenance',
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    priority ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium',
    status ENUM('new', 'assigned', 'awaiting_approval', 'in_progress', 'done', 'verified', 'canceled') NOT NULL DEFAULT 'new',
    assignee_user_id INT NULL,
    window_start DATETIME NULL,
    window_end DATETIME NULL,
    due_at DATETIME NULL,
    cost_estimate DECIMAL(10,2) NULL,
    cost_actual DECIMAL(10,2) NULL,
    approved_amount DECIMAL(10,2) NULL,
    approved_by INT NULL,
    approved_at TIMESTAMP NULL,
    completion_notes TEXT NULL,
    access_code_override_enc TEXT NULL, -- 2026-10-08 00:10, G7 S3
    checklist_template_id INT NULL, -- 2026-10-08 02:30, G7 S4 (FK added after checklist_templates)
    schedule_id INT NULL, -- 2026-10-08 10:30, G7 S8 (FK added after maintenance_schedules)
    schedule_due_on DATE NULL,
    overdue_alerted_at TIMESTAMP NULL,
    unassigned_alerted_at TIMESTAMP NULL,
    late_alerted_at TIMESTAMP NULL, -- 2026-10-10 10:18, #62 late / no-show alert sent
    created_by INT NULL, -- NULL = created by the system (urgent guest report)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (amenity_id) REFERENCES amenities(id) ON DELETE SET NULL,
    FOREIGN KEY (guest_report_id) REFERENCES guest_reports(id) ON DELETE SET NULL,
    FOREIGN KEY (assignee_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_company_status (company_id, status),
    INDEX idx_assignee_status (assignee_user_id, status),
    INDEX idx_report (guest_report_id)
);

-- Append-only: every transition, comment and approval, with the actor and time
CREATE TABLE work_order_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    work_order_id INT NOT NULL,
    actor_user_id INT NULL, -- NULL = system
    action VARCHAR(30) NOT NULL,
    note TEXT NULL,
    data JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    client_created_at DATETIME NULL, -- 2026-10-08 05:00, G7 S5: phone time for updates sent later
    FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_order_created (work_order_id, created_at)
);

-- 2026-10-08 00:10, G7 Ops stage 3 (same as migrations/2026-10-07_ops_on_site.sql)
-- Access codes live in their own table so no property query (dashboard, tablet, guest link) can ever return them
CREATE TABLE property_access (
    property_id INT PRIMARY KEY,
    access_code_enc TEXT NULL, -- AES-256-GCM (OPS_SECRET_KEY)
    access_notes VARCHAR(500) NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- One active sticker per property; token_hash for lookups, token_enc so the manager can reprint it
CREATE TABLE property_qr_tokens (
    id INT PRIMARY KEY AUTO_INCREMENT,
    property_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    token_enc TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP NULL,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    INDEX idx_property (property_id)
);

-- Files live under storage/ops (not public); served only through signed, short-lived URLs
CREATE TABLE work_order_photos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    work_order_id INT NOT NULL,
    kind ENUM('before', 'after', 'step', 'receipt') NOT NULL DEFAULT 'after',
    path VARCHAR(255) NOT NULL,
    caption VARCHAR(255) NULL,
    uploaded_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_order (work_order_id)
);

-- On-site time (QR or button); stage 7 adds review/edits and pay export
CREATE TABLE time_entries (
    id INT PRIMARY KEY AUTO_INCREMENT,
    work_order_id INT NOT NULL,
    user_id INT NOT NULL,
    clock_in DATETIME NOT NULL,
    clock_out DATETIME NULL,
    method_in ENUM('qr', 'button', 'manual') NOT NULL, -- manual = added by a manager (2026-10-08 09:00, G7 S7)
    method_out ENUM('qr', 'button', 'submit', 'system') NULL, -- system = job canceled/reassigned while on site
    created_by INT NULL,
    edited BOOLEAN NOT NULL DEFAULT false,
    voided_at TIMESTAMP NULL,
    void_reason VARCHAR(500) NULL,
    lat_in DECIMAL(9,6) NULL, -- 2026-10-10 10:18, #62 phone location at check-in/out; dist_* = metres from the property spot
    lng_in DECIMAL(9,6) NULL,
    acc_in SMALLINT UNSIGNED NULL,
    dist_in INT UNSIGNED NULL,
    lat_out DECIMAL(9,6) NULL,
    lng_out DECIMAL(9,6) NULL,
    acc_out SMALLINT UNSIGNED NULL,
    dist_out INT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_time_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL, -- 2026-10-08 11:30, #45: index named as in the migration so fresh installs and migrated databases match
    INDEX idx_user_open (user_id, clock_out),
    INDEX idx_order (work_order_id)
);

-- 2026-10-08 02:30, G7 Ops stage 4 (same as migrations/2026-10-08_ops_checklists.sql)
CREATE TABLE checklist_templates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    name VARCHAR(120) NOT NULL,
    type ENUM('maintenance', 'cleaning', 'inspection', 'ad_hoc') NOT NULL DEFAULT 'cleaning',
    active BOOLEAN NOT NULL DEFAULT true,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_company (company_id, active)
);

CREATE TABLE checklist_template_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    template_id INT NOT NULL,
    label VARCHAR(255) NOT NULL,
    requires_photo BOOLEAN NOT NULL DEFAULT false,
    position INT NOT NULL DEFAULT 0,
    FOREIGN KEY (template_id) REFERENCES checklist_templates(id) ON DELETE CASCADE,
    INDEX idx_template (template_id, position)
);

ALTER TABLE work_orders ADD CONSTRAINT fk_wo_checklist FOREIGN KEY (checklist_template_id) REFERENCES checklist_templates(id) ON DELETE SET NULL;

-- The job's own copy: later template edits never change a job that already has its checklist
CREATE TABLE work_order_checklist (
    id INT PRIMARY KEY AUTO_INCREMENT,
    work_order_id INT NOT NULL,
    label VARCHAR(255) NOT NULL,
    requires_photo BOOLEAN NOT NULL DEFAULT false,
    position INT NOT NULL DEFAULT 0,
    done BOOLEAN NOT NULL DEFAULT false,
    done_at TIMESTAMP NULL,
    done_by INT NULL,
    photo_id INT NULL,
    note VARCHAR(500) NULL,
    FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (done_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (photo_id) REFERENCES work_order_photos(id) ON DELETE SET NULL,
    INDEX idx_order (work_order_id, position)
);

-- 2026-10-08 05:00, G7 Ops stage 5 (same as migrations/2026-10-08_ops_offline_push.sql)
-- An update queued offline is sent with a client-generated id; a resend returns the first result instead of applying it twice
CREATE TABLE client_ops (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    op_id CHAR(36) NOT NULL,
    request VARCHAR(255) NOT NULL, -- method + path; an id reused on another request is refused
    status_code SMALLINT NOT NULL,
    response JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_op (user_id, op_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_created (created_at)
);

CREATE TABLE push_subscriptions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    endpoint VARCHAR(1000) NOT NULL,
    endpoint_hash CHAR(64) NOT NULL UNIQUE,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(255) NOT NULL,
    user_agent VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id)
);

-- 2026-10-08 07:10, G7 Ops stage 6 (same as migrations/2026-10-08_ops_vendors.sql)
-- One profile per worker account (a vendor working for several companies keeps one certificate)
CREATE TABLE vendor_profiles (
    user_id INT PRIMARY KEY,
    business_name VARCHAR(160) NULL,
    license_no VARCHAR(80) NULL,
    insurance_provider VARCHAR(120) NULL,
    coi_path VARCHAR(255) NULL,          -- private file under OPS_STORAGE_DIR/coi (PDF or re-encoded image)
    coi_mime VARCHAR(40) NULL,
    coi_uploaded_at TIMESTAMP NULL,
    coi_expires_on DATE NULL,
    coi_verified_by INT NULL,            -- a manager looked at the file and confirmed the date
    coi_verified_at TIMESTAMP NULL,
    coi_alert_level ENUM('none', '30', '7', 'expired') NOT NULL DEFAULT 'none', -- last expiry reminder sent (reset when the date changes)
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (coi_verified_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_expiry (coi_expires_on)
);

-- 2026-10-08 09:00, G7 Ops stage 7 (same as migrations/2026-10-08_ops_time.sql)
-- Every manager change to a time entry, with the values before and after (pay disputes)
CREATE TABLE time_entry_edits (
    id INT PRIMARY KEY AUTO_INCREMENT,
    time_entry_id INT NOT NULL,
    editor_id INT NULL,
    action ENUM('added', 'edited', 'closed', 'voided') NOT NULL,
    reason VARCHAR(500) NOT NULL,
    before_json JSON NULL,
    after_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (time_entry_id) REFERENCES time_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (editor_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_entry (time_entry_id)
);

-- 2026-10-08 10:30, G7 Ops stage 8 (same as migrations/2026-10-08_ops_schedules.sql)
CREATE TABLE maintenance_schedules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    property_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    type ENUM('maintenance', 'cleaning', 'inspection', 'ad_hoc') NOT NULL DEFAULT 'maintenance',
    priority ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium',
    checklist_template_id INT NULL,
    default_assignee_user_id INT NULL,
    recurrence ENUM('every_n_days', 'weekly', 'monthly') NOT NULL,
    interval_days INT NULL,          -- every_n_days
    weekday TINYINT NULL,            -- weekly: 0 = Monday … 6 = Sunday
    month_day TINYINT NULL,          -- monthly: 1–28
    window_start_time CHAR(5) NOT NULL DEFAULT '09:00', -- local time in companies.timezone
    window_hours TINYINT NOT NULL DEFAULT 4,
    lead_days TINYINT NOT NULL DEFAULT 3,                -- the job is created this many days before it is due
    next_due_on DATE NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    last_order_id INT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (checklist_template_id) REFERENCES checklist_templates(id) ON DELETE SET NULL,
    FOREIGN KEY (default_assignee_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_due (active, next_due_on)
);

ALTER TABLE work_orders
    ADD CONSTRAINT fk_wo_schedule FOREIGN KEY (schedule_id) REFERENCES maintenance_schedules(id) ON DELETE SET NULL,
    ADD UNIQUE KEY uniq_schedule_occurrence (schedule_id, schedule_due_on);

-- 2026-10-09 12:11, #56 password reset links (same as migrations/2026-10-09_password_resets.sql)
CREATE TABLE password_resets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_reset_token (token_hash),
    INDEX idx_reset_user (user_id, created_at)
);
