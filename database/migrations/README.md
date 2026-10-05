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

Back up the database first. Not yet run against real MySQL (task #45).
