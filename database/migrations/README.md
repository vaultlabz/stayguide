# Migrations: apply in this order

<!-- 2026-10-05 08:22, several files share a date, so filename order is NOT apply order -->

Run each file once against existing databases (new installs use `database/schema.sql`, which already includes everything):

1. `2026-10-03_property_main_image.sql`: `properties.main_image_url`
2. `2026-10-03_devices.sql`: tablet pairing (`devices`)
3. `2026-10-03_guest_links.sql`: direct booking / review links + `link_clicks` (needs #1: `AFTER main_image_url`)
4. `2026-10-03_tablet_theme.sql`: tablet theme + background image
5. `2026-10-03_tablet_background.sql`: tablet background presets
6. `2026-10-03_tablet_home.sql`: weather location, units, clock format
7. `2026-10-03_guest_link.sql`: phone guide link token, Wi-Fi toggle, `guest_reports.source`, `link_clicks.medium` (needs #3)
8. `2026-10-03_plans_billing.sql`: plans, Stripe, `stripe_events`, `hardware_orders`; **grandfathers existing companies as Pro (legacy)**
9. `2026-10-04_section_events.sql`: section analytics
10. `2026-10-07_ops_foundations.sql`: G7 Ops stage 1: `field_worker` role, `companies.ops_addon`, `company_workers`, `worker_invites`, `login_codes`
11. `2026-10-07_ops_work_orders.sql`: G7 Ops stage 2: `work_orders`, `work_order_events`, `companies.ops_approval_threshold`
12. `2026-10-07_ops_on_site.sql`: G7 Ops stage 3: `property_access` (encrypted codes), `work_orders.access_code_override_enc`, `property_qr_tokens`, `work_order_photos`, `time_entries`
13. `2026-10-08_ops_checklists.sql`: G7 Ops stage 4: `checklist_templates`, `checklist_template_items`, `work_order_checklist`, `work_orders.checklist_template_id`
14. `2026-10-08_ops_offline_push.sql`: G7 Ops stage 5: `client_ops`, `push_subscriptions`, `work_order_events.client_created_at`
15. `2026-10-08_ops_vendors.sql`: G7 Ops stage 6: `vendor_profiles` (business details, insurance certificate + expiry)
16. `2026-10-08_ops_time.sql`: G7 Ops stage 7: `time_entries` manual/edited/void columns, `time_entry_edits`
17. `2026-10-08_ops_schedules.sql`: G7 Ops stage 8: `maintenance_schedules`, `companies.timezone`, `work_orders` schedule + alert columns
18. `2026-10-08_device_pairing_reasons.sql`: #33 `devices.used_pairing_code`, `paired_at` (clearer pairing errors)

Back up the database first.

<!-- 2026-10-08 13:45, #45 -->
**Verified 2026-10-08 on MySQL 9.3** (task #45): the pre-migration schema plus steps 1–18 in this order gives exactly the same columns, types, defaults, indexes and foreign keys as a fresh `schema.sql`. The e2e suites run against real MySQL with `npm run build && npm run test:mysql` (resets `DB_NAME`, which must end in `_dev` or `_test`, to the mock demo data before each suite).
