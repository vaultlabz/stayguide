-- 2026-10-08 05:00, G7 Ops stage 5: offline replay (idempotent client operations), web push subscriptions, device time on events
-- Apply after 2026-10-08_ops_checklists.sql (see README.md). Plan: docs/G7_OPS_PLAN.md

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

-- When the worker actually did it (phone clock), next to created_at (when the server received it)
ALTER TABLE work_order_events ADD COLUMN client_created_at DATETIME NULL;
