updated: 2026-10-08 (/go sync; content from 08:12 handoff)
tool: claude-code
branch: feature/g7-ops (2 commits ahead of main: c194330 code, fe31191 mgr session files; not pushed, not merged)

## Focus

Finishing the open small items after the G7 Ops add-on (all 9 stages built, committed, full regression green), then #45 real-MySQL verification.

## Active tasks

- [ ] (31) Center last row of tablet home tiles: IN PROGRESS, uncommitted. `public/css/tablet-app.css` now uses flex (`.tiles` flex-wrap + `.tiles > .tile` basis 25%). Bug found by design-test: "Report an Issue" renders 175 px (others 263) because it sits inside a wrapper (`.report-card`), not a direct `.tile` child. Fix: give the wrapper the same flex basis (e.g. `.tiles > :is(.tile, .report-card)`) and make the inner button fill it; re-run `tests/e2e/design-test.js` (expects 7 tiles ≥120 px within 1280x800)
- [ ] (33) Clearer pairing errors: DONE, uncommitted. `DeviceService.whyCodeFailed`, `MockDeviceService.whyCodeFailed`, `DeviceController.pair` returns PAIRING_FORMAT / PAIRING_EXPIRED / PAIRING_USED / PAIRING_INVALID; migration `database/migrations/2026-10-08_device_pairing_reasons.sql` (README step 18) + `schema.sql` (`devices.used_pairing_code`, `paired_at`); checks added to `tests/e2e/phase3-test.js` (pass). Mark #33 done in MGR/tasks.json and add a docs/todo.md entry
- [ ] (34) Stale yarn.lock: project uses npm (package-lock.json); npm keeps rewriting yarn.lock. Plan: `git rm yarn.lock`
- [ ] Replace placeholder `public/img/hero-devices.{png,webp}` (another brand's UI) with `hero-devices-stayguide.{png,webp}` in `src/views/landing.html` (height 860), per docs/todo.md 2026-10-06
- [ ] (45) Verify on real MySQL: local MySQL runs on localhost (root, empty password; DBs eventpilot, honeydew, …, no stayguide_dev yet). Create stayguide_dev from database/schema.sql (+ seed), run the suites with MOCK_DATABASE=false (tests currently force MOCK_DATABASE=true in their spawn env)
- [ ] (46) Production deploy checklist (write docs, needs server details from the user)
- [ ] User decisions/secrets: OPS_PRICE_MONTHLY (+ `npm run stripe:setup` → STRIPE_PRICE_OPS_MONTHLY), OPS_SECRET_KEY, VAPID keys, SMTP creds + SUPPORT_EMAIL
- [ ] (42) Stripe dashboard config · (43) Trinity design pass incl. Ops/helpdesk screens · (30) real Tab A11+ check · backlog #12–#14, #16, #25
- [ ] Merge / PR feature/g7-ops → main

## Done this session (2026-10-07 → 08)

- Wired all stubbed dashboard functions (admin edit/stats, CSV export, invoice PDF, helpdesk, help page, guest reports card, /login, SMTP email)
- Cleanup (proxy-addr fix, separate admin token, logout keeps tablet pairing)
- G7 Ops add-on S1–S9 (docs/G7_OPS_PLAN.md; logged per stage in docs/todo.md)
- Final full regression before the commit: build + 21 suites all green (incl. ops-s1…s9, billing 62/62)
- MGR/todo/notes.txt: appended a completed/pending block (uncommitted)

## Uncommitted on disk (feature/g7-ops)

public/css/tablet-app.css, src/services/DeviceService.ts, src/services/MockDeviceService.ts, src/controllers/DeviceController.ts, database/schema.sql, database/migrations/README.md, database/migrations/2026-10-08_device_pairing_reasons.sql, tests/e2e/phase3-test.js, MGR/todo/notes.txt; untracked public/img/hero-pool.jpg (unused, intentionally not committed)

## Blockers

- Launch secrets/decisions above are the user's

## Notes for next agent

- Dev server: `npm run dev` (mock mode, port 3000). Demo logins: company admin@demorentals.com / demo123, super admin admin@stayguide.com / admin123, worker /maint tech@demorentals.com / tech1234
- Tests: `PLAYWRIGHT_CHROMIUM_PATH=~/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell`; run single suites with `TEST_PORT=39xx node tests/e2e/<name>-test.js` to avoid port clashes; `npm test` stops at the first failing suite
- In-code `// 2026-10-08 HH:MM` stamps added after ~07:00 on 2026-10-08 are approximate (some read later than the real time)
- User preference: "run the app" = start the server and open landing, tablet and admin dashboard in Chrome
