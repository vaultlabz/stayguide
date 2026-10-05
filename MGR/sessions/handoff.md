updated: 2026-10-05 08:19
tool: claude-code
branch: main (design branch merged via PR #1; worktree ../stayguide-design still exists)

## Focus

The guest product (plan G0–G6) is complete and pushed. Next: **configure the Stripe dashboard (#42), verify on real MySQL (#45), then plan G7** (field/maintenance web app, Ops add-on). G7 needs its own plan before building.

## Active tasks

Each pending task in `MGR/tasks.json` has `context`: doing, achieve, according.

- [ ] (42) — Stripe dashboard config: Bank transfers, Customer Portal plan switching + cancel at period end, StayGuide branding — *high*
- [ ] (45) — Verify on real MySQL: apply the 10 migrations to staging and run the e2e suites against it — *high*
- [ ] (41) — G7: Field/maintenance web app (Ops add-on): own plan before build
- [ ] (43) — Trinity design pass on new screens (docs/TRINITY_DESIGN_UPDATE.md)
- [ ] (44) — Company sign-in screen (replace prompt())
- [ ] (46) — Production deploy prep (HTTPS, Node ≥ 20.9, APP_BASE_URL, TRUST_PROXY=1, live Stripe, webhook endpoint, migrations)
- [ ] (25) — External API v1 (Stays, Conversions, webhooks), spec in docs/INTEGRATION_GUIDE.md
- [ ] (12, 13, 14, 15, 16, 17) — older backlog: admin amenities UI, real-time alerts, advanced analytics, email alerts, manager mobile app, helpdesk
- [ ] (30) — Real-device check on Galaxy Tab A11+ · (31) center 4+3 tile row · (33) clearer pairing errors · (34) stale yarn.lock

## Done this session

- **PRD v1.0 discussion** → plan: guest product first, generic AIO kits allowed, maintenance app later as the Ops add-on
- **G0** merged `design` → `main` (PR #1); e2e suites moved into `tests/e2e/` (`npm test`)
- **G1** guide content management (restaurants, videos, local info, announcements, welcome)
- **G2** free-tier phone/web guide link `/g/:token` (Wi-Fi toggle, rotation, phone layout)
- **G3** plans/entitlements, self-serve signup, Stripe Billing (Checkout with cards + ACH, invoices, portal, webhooks, quantity sync), billing page
- **Stripe sandbox (Wingu Digital test)** wired: 7 prices, CLI 1.53.0 installed from the GitHub release, real end-to-end purchase verified (Checkout → webhook → Pro → qty 2 → cancel → Free)
- **G5** marketing pricing section + signup CTAs (server-rendered from `src/config/plans.ts`)
- **G4** section analytics (`section_events`, tablet + phone tracking, dashboard Guest activity)
- **G6** `/tablet/diagnostics` + AIO vetting checklist in KIOSK_SETUP.md
- **Trinity design update** with 18 screenshots (docs/TRINITY_DESIGN_UPDATE.md)
- Regression: 590 automated checks green (unit 24 + e2e suites)

## Next

1. In Stripe (test mode): enable Bank transfers, configure the Customer Portal, set StayGuide branding (#42)
2. Stand up a MySQL staging DB, apply `database/migrations/*` in date order, run `npm test` against it (#45)
3. Plan G7 (maintenance/field app): decide the Ops price, vendor access model, checklists, photo storage, notifications, offline needs
4. Send Trinity the update link (contact channel unknown; ask the user)

## Blockers

- Trinity's contact channel is unknown (the doc is in the repo)
- Email transport not wired (nodemailer missing; task #15), which blocks invoice and alert emails from StayGuide itself (Stripe sends its own)

## Notes for next agent

- Tests: `PLAYWRIGHT_CHROMIUM_PATH=~/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell npm test`. The suites start their own server on port 3917 (billing also uses 3919 for a fake Stripe)
- `.env` (git-ignored) holds the Stripe **test** key, webhook secret (from `stripe listen --print-secret`) and price IDs. Never use the live key in ~/Desktop/ctrl/master.txt
- Local webhooks: `stripe listen --api-key <test key> --forward-to localhost:3000/billing/webhook`
- Migrations to apply (10): property_main_image, devices, guest_links, tablet_theme, tablet_background, tablet_home, guest_link, plans_billing, section_events (in `database/migrations/`, by date)
- Existing companies are grandfathered as Pro (`subscription_status = 'legacy'`) by the plans_billing migration
