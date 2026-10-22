-- 2026-10-08 02:30, G7 Ops stage 4: checklist templates and per-job checklists (copied from a template when attached)
-- Apply after 2026-10-07_ops_on_site.sql (see README.md). Plan: docs/G7_OPS_PLAN.md

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

ALTER TABLE work_orders ADD COLUMN checklist_template_id INT NULL,
    ADD CONSTRAINT fk_wo_checklist FOREIGN KEY (checklist_template_id) REFERENCES checklist_templates(id) ON DELETE SET NULL;

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
