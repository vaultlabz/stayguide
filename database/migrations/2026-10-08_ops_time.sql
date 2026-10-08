-- 2026-10-08 09:00, G7 Ops stage 7: manager review of time entries (edit / add / void with a reason), audit trail for pay
-- Apply after 2026-10-08_ops_vendors.sql (see README.md). Plan: docs/G7_OPS_PLAN.md

ALTER TABLE time_entries
    MODIFY method_in ENUM('qr', 'button', 'manual') NOT NULL,
    ADD COLUMN created_by INT NULL,            -- set when a manager added the entry by hand
    ADD COLUMN edited BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN voided_at TIMESTAMP NULL,
    ADD COLUMN void_reason VARCHAR(500) NULL,
    ADD CONSTRAINT fk_time_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

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
