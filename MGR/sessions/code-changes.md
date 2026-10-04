# Code changes — APPEND ONLY
#
# One line per code change: timestamp | tool | description/file
2026-10-03 11:37 | claude-code | Phase 0 security fixes: SQL field whitelist, amenity/report ownership, tenant middleware
2026-10-03 11:43 | claude-code | Phase 1 tablet device pairing: devices table, /tablet, pairing codes, device tokens, guest report lockdown
2026-10-03 11:57 | claude-code | Phase 2 offline tablet: service worker, manifest, offline banner, auto-refresh, offline report message
2026-10-03 12:00 | claude-code | Phase 3 tablet fixes: XSS escaping, in-app video modal (sandboxed), report form trimmed, restaurant names
2026-10-03 12:01 | claude-code | Phase 4 docs/KIOSK_SETUP.md (Fully Kiosk provisioning)
2026-10-03 12:36 | claude-code | Phase 5 direct-booking/review QR codes, /r scan redirects, link stats, integration guide v0.2
2026-10-03 12:50 | claude-code | Dependency security updates (prod audit 0), sharp 0.35 + Node>=20.9, undefined-bind fixes, tablet announcements
2026-10-03 13:34 | claude-code | Follow-ups: deps update, announcements, undefined-bind fixes; package.json, src/services/*, src/views/tablet-app.html
2026-10-03 17:53 | claude-code | Session end: handoff, tasks #32-34, MEMORY decisions; MGR/, .mgr/memory/MEMORY.md
2026-10-03 17:38 | claude-code | Design branch: tablet redesign with Figma gradients, icon home, clock/weather, transitions
2026-10-03 22:39 | claude-code | G1 guide content management; ContentService, ContentController, ownership/video utils, dashboard editor, content-test
2026-10-03 23:04 | claude-code | G2 free-tier phone/web guide link; guest-link routes/controller, tablet-app guest mode, dashboard section, migration, tests
2026-10-03 23:31 | claude-code | G3 plans/entitlements, self-serve signup, Stripe Billing (Checkout+ACH, invoices, portal, webhooks), billing page, BILLING_SETUP.md
2026-10-04 00:24 | claude-code | G5 marketing pricing section (server-rendered from plans.ts), signup CTAs, FAQ, JSON-LD; landing.html, pricing-html.ts
2026-10-04 00:40 | claude-code | G4 section analytics: section_events, device/guide event endpoints, tablet tracking, dashboard guest activity
2026-10-04 01:01 | claude-code | G6 /tablet/diagnostics + AIO vetting checklist; tablet-diagnostics.html, device.ts, KIOSK_SETUP.md
