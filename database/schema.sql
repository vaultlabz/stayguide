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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
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
    role ENUM('super_admin', 'company_admin') NOT NULL,
    company_id INT NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    last_login TIMESTAMP NULL,
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
    temperature_unit ENUM('F', 'C') NOT NULL DEFAULT 'F',
    clock_format ENUM('12h', '24h') NOT NULL DEFAULT '12h',
    tablet_background ENUM('solid', 'image', 'manhattan-ice', 'apricot-storm', 'barley-titan', 'silver-cloud', 'erie-charcoal', 'burnham-stone', 'baltic-rose', 'rich-bistre') NOT NULL DEFAULT 'solid', -- 2026-10-03 16:42
    guest_link_token VARCHAR(64) NULL UNIQUE, -- 2026-10-03 22:42, G2 public guide link
    guest_link_show_wifi BOOLEAN NOT NULL DEFAULT TRUE,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE KEY unique_company_slug (company_id, slug),
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
    last_seen_at TIMESTAMP NULL,
    status ENUM('pending', 'active', 'revoked') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    UNIQUE KEY unique_token_hash (token_hash),
    INDEX idx_pairing_code (pairing_code, status),
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
