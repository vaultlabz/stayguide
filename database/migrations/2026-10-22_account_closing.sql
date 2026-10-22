-- 2026-10-22 15:52, #66 account closing: closed_at starts the waiting period before the data purge; purged_at marks it done
-- (the row stays, anonymized, so billing records and hardware orders keep their company for tax).
-- Apply after 2026-10-22_terms_acceptance.sql.
ALTER TABLE companies
    ADD COLUMN closed_at TIMESTAMP NULL AFTER cancel_at_period_end,
    ADD COLUMN purged_at TIMESTAMP NULL AFTER closed_at;
