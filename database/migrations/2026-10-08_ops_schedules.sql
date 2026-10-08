-- 2026-10-08 10:30, G7 Ops stage 8: preventive maintenance schedules, overdue / unassigned alerts, company time zone
-- Apply after 2026-10-08_ops_time.sql (see README.md). Plan: docs/G7_OPS_PLAN.md

ALTER TABLE companies ADD COLUMN timezone VARCHAR(64) NOT NULL DEFAULT 'America/Denver';

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
    ADD COLUMN schedule_id INT NULL,
    ADD COLUMN schedule_due_on DATE NULL,              -- which occurrence this job is (no duplicates)
    ADD COLUMN overdue_alerted_at TIMESTAMP NULL,
    ADD COLUMN unassigned_alerted_at TIMESTAMP NULL,
    ADD CONSTRAINT fk_wo_schedule FOREIGN KEY (schedule_id) REFERENCES maintenance_schedules(id) ON DELETE SET NULL,
    ADD UNIQUE KEY uniq_schedule_occurrence (schedule_id, schedule_due_on);
