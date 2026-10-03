-- Guest Reports Table for Tablet App Submissions
-- This table stores reports submitted by guests through the tablet app
-- Separate from helpdesk_tickets since guests are not authenticated users

CREATE TABLE guest_reports (
    id INT PRIMARY KEY AUTO_INCREMENT,
    property_id INT NOT NULL,
    guest_name VARCHAR(255),
    guest_room VARCHAR(50),
    guest_phone VARCHAR(50),
    category ENUM(
        'maintenance', 
        'supplies', 
        'housekeeping', 
        'amenities', 
        'wifi_tech', 
        'noise_complaint',
        'other'
    ) NOT NULL,
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (resolved_by) REFERENCES users(id),
    INDEX idx_property_status (property_id, status),
    INDEX idx_category_priority (category, priority),
    INDEX idx_created_at (created_at),
    INDEX idx_urgency (urgency_level)
);

-- Add some sample categories for common issues
-- This helps with consistent reporting and routing
