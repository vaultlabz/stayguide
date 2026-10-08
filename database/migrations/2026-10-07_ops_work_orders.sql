-- 2026-10-07 22:10, G7 Ops stage 2: work orders + append-only event log, cost approval threshold
-- Apply after 2026-10-07_ops_foundations.sql (see README.md). Plan: docs/G7_OPS_PLAN.md

ALTER TABLE companies ADD COLUMN ops_approval_threshold DECIMAL(10,2) NULL DEFAULT 250.00;

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
    FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_order_created (work_order_id, created_at)
);
