-- 2026-10-07 18:30, G7 Ops stage 1: field worker role, company memberships, invites, email sign-in codes, Ops add-on flag
-- Apply after 2026-10-04_section_events.sql (see README.md). Plan: docs/G7_OPS_PLAN.md

ALTER TABLE users MODIFY role ENUM('super_admin', 'company_admin', 'field_worker') NOT NULL;

ALTER TABLE companies ADD COLUMN ops_addon BOOLEAN NOT NULL DEFAULT false;

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
