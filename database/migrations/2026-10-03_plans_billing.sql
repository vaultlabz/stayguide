-- 2026-10-03 23:06, G3 plans, entitlements and Stripe Billing
ALTER TABLE companies
    ADD COLUMN plan ENUM('free', 'pro', 'portfolio') NOT NULL DEFAULT 'free',
    ADD COLUMN billing_interval ENUM('month', 'year') NULL,
    ADD COLUMN subscription_status VARCHAR(32) NULL,          -- legacy | active | trialing | past_due | unpaid | canceled | incomplete
    ADD COLUMN stripe_customer_id VARCHAR(64) NULL,
    ADD COLUMN stripe_subscription_id VARCHAR(64) NULL,
    ADD COLUMN current_period_end TIMESTAMP NULL,
    ADD COLUMN cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    ADD UNIQUE KEY unique_stripe_customer (stripe_customer_id);

-- Grandfather companies created before self-serve billing (manually invoiced): keep full access
UPDATE companies SET plan = 'pro', subscription_status = 'legacy' WHERE subscription_status IS NULL;

-- Webhook idempotency: each Stripe event is applied once
CREATE TABLE stripe_events (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(100) NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Hardware kits bought or bundled through Checkout, fulfilled from the admin dashboard
CREATE TABLE hardware_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    kit ENUM('desk', 'wall') NOT NULL,
    mode ENUM('purchase', 'bundle') NOT NULL,
    status ENUM('pending', 'paid', 'shipped', 'cancelled') NOT NULL DEFAULT 'pending',
    stripe_checkout_session_id VARCHAR(255) NULL UNIQUE,
    amount_total DECIMAL(10,2) NULL,
    shipping_details TEXT NULL,                                -- JSON from Checkout
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    INDEX idx_status (status)
);

-- Legacy manual-invoice table: columns the code already wrote but the schema lacked
ALTER TABLE billing
    ADD COLUMN stripe_payment_intent_id VARCHAR(255) NULL,
    ADD COLUMN stripe_customer_id VARCHAR(64) NULL;
