-- Amenities Table (CRITICAL FIX - Missing from main schema.sql)
-- This table was referenced in code but missing from database schema

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
    template_id INT NULL, -- Reference to global templates (future)
    
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

-- Enhanced Guest Reports with Amenity Linking
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

-- Insert sample global amenity templates (Super Admin standards)
INSERT INTO global_amenity_templates (name, description, icon, category, is_standard, created_by) VALUES
('WiFi Internet', 'High-speed wireless internet access', '📶', 'technology', true, 1),
('Air Conditioning', 'Climate control system', '❄️', 'comfort', true, 1),
('Kitchen', 'Fully equipped kitchen', '🍳', 'kitchen', true, 1),
('Parking', 'Dedicated parking space', '🚗', 'location', false, 1),
('Pool', 'Swimming pool access', '🏊‍♂️', 'recreation', false, 1),
('Hot Tub', 'Spa hot tub', '🛁', 'recreation', false, 1),
('Fireplace', 'Wood or gas fireplace', '🔥', 'comfort', false, 1),
('Security System', 'Property security monitoring', '🔒', 'safety', false, 1);
