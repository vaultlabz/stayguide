# Session log (latest) — APPEND ONLY
#
# Add new entries at the END. Prefix each entry with YYYY-MM-DD HH:MM

2026-10-03 10:58 initialized

## 2026-10-03 10:58 | claude-code

- Initialized mgr protocol (flat MGR/ layout, tasks.json v2, empty backlog).
- Existing history lives in docs/todo.md and docs/CHANGELOG.md (not migrated).

## 2026-10-03 10:59 | claude-code

- Seeded MGR/tasks.json from docs/todo.md: #1–#11 done (logged milestones), #12–#17 pending (5 optional enhancements + unbuilt Phase 3 helpdesk).

2026-10-03 13:34
## Checkpoint (claude-code)
- session report: tablet kiosk plan Phases 0–5 + follow-ups, before first git commit/push
- Done: mgr init; tasks seeded from docs/todo.md (#1–#17); code audit; Flutter→web+kiosk decision (managed tablets); GVR + smart-hardware roadmap discussion
- Built: Phase 0 security (SQL field whitelist, tenant/amenity/report ownership), Phase 1 tablet pairing (/tablet, devices, codes/tokens), Phase 2 offline PWA, Phase 3 escaping + video modal + report form, Phase 4 docs/KIOSK_SETUP.md, Phase 5 book-direct/review QR + /r redirects + link stats
- Follow-ups: deps updated (prod audit 0; sharp 0.35 → Node ≥20.9), 4 undefined-bind bugs fixed, announcements on tablet; docs/INTEGRATION_GUIDE.md v0.2
- Verified: curl checks + headless Chromium suites (15/21/24 pass); MySQL paths code-reviewed only; 3 migrations in database/migrations/ must be run before deploy
- Open: #25 external API (stays/conversions/webhooks); clearer pairing-code error message; yarn.lock stale; repo not yet in git (committing + pushing to github.com/vaultlabz now)

2026-10-03 13:35
## Checkpoint (claude-code)
- Git: initial commit 4ace9ce pushed to private repo https://github.com/vaultlabz/stayguide (branches main + design)
- Sharing: jonbeatz (jonbeatz@gmail.com) already has admin via vaultlabz org membership; no invite needed

2026-10-03 17:52
## Checkpoint (claude-code)
- a session report and /stop
- main: tablet plan Phases 0–5 + follow-ups (deps, announcements), INTEGRATION_GUIDE v0.2, KIOSK_SETUP incl. hardware specs; pushed (9d79023) to private github.com/vaultlabz/stayguide; jonbeatz has org admin access
- design branch (worktree ../stayguide-design): UI redesign + tablet redesign (icon-only home, glass UI, 8 Figma luxury gradients, clock/Open-Meteo weather, Wi-Fi join QR, ease-in transitions, blurred sheets); pushed at d9ddc57; tasks #28–#31 live in design's MGR/tasks.json until merged
- Uncommitted: none. Demo server running from design worktree on :3000 (mock mode)
- Open: identify/notify "muse" agent; PR design → main; real Tab A11+ check (#30); center tile row (#31); external API (#25); yarn.lock stale

2026-10-03 17:53
## Session end (claude-code)
- Summary: mgr init → audit → web+kiosk decision → tablet plan Phases 0–5 + follow-ups on main; GVR/hardware roadmap; integration + kiosk/hardware docs; private GitHub repo (main, design); design-engineer redesign with Figma luxury gradients on design. Handoff overwritten; tasks #32–#34 added; MEMORY.md decisions recorded.
- Files (main): src/utils/sql.ts, src/services/{Property,Company,User,Device,MockDevice,Link,Billing,IntegratedAdminAmenity}Service.ts, src/controllers/{Property,Report,Device}Controller.ts, src/middleware/{auth,rate-limit}.ts, src/routes/{company,reports,device,links,index}.ts, src/index.ts, src/views/{tablet-app,company-dashboard}.html, public/{sw.js,manifest.json,css/tablet-app.css,icons/}, database/{schema.sql,migrations/}, docs/{INTEGRATION_GUIDE,KIOSK_SETUP,todo}.md, package.json
- Files (design): see commits 50d8db5, 2df381a, 5466d12, d9ddc57
2026-10-03 17:38
## Checkpoint (claude-code)
- Design branch: UI redesign (50d8db5) + tablet redesign with 8 Figma luxury gradients, icon-only home, clock/weather, Wi-Fi QR, transitions + blur (2df381a, 5466d12); pushed to origin/design
- Gradients extracted via Figma MCP (file vvZxGSsNrWLCILQJkV3aaY) and pre-rendered to public/img/gradients/*.webp
- Verified: tsc/build, design suite 326/326, regression 15/21/24; live Open-Meteo weather + geocode OK; not yet on a real Tab A11+
- Open: notify "muse" agent (unknown target); center 4+3 tile row; real-device check; merge design → main when approved

2026-10-04 00:00
## Checkpoint (claude-code)
- Stripe sandbox (Wingu Digital, test mode) wired: 7 prices via npm run stripe:setup; test key + CLI webhook secret in git-ignored .env
- Stripe CLI 1.53.0 installed from official GitHub release (checksum verified); Homebrew failed on outdated CLT (Intel Mac)
- Real sandbox E2E: Checkout 4242 → webhook → Pro active → pairing → qty 2 → cancel → Free; 4 webhooks delivered, all 200
- Next: G5 marketing pricing section

2026-10-05 08:20
## Session end (claude-code)
- Summary: PRD v1.0 reviewed → guest-product plan G0–G6 shipped on main (merge design, content mgmt, phone guide link, plans/signup/Stripe billing incl. real sandbox E2E, marketing pricing, section analytics, tablet diagnostics); Trinity design update with screenshots; tasks #42–#46 added; handoff overwritten
- Files: src/config/plans.ts, src/services/{Content,Entitlement,StripeBilling,Analytics}Service.ts, src/controllers/{Content,GuestLink,BillingPlan,Signup,Analytics}Controller.ts, src/routes/{guest-link,company,device,api,index,admin}.ts, src/utils/{ownership,video,pricing-html}.ts, src/views/{tablet-app,company-dashboard,company-billing,signup,landing,tablet-diagnostics}.html, public/{sw.js,css/tablet-app.css}, database/{schema.sql,migrations/*}, scripts/stripe-sandbox-setup.js, tests/e2e/*, docs/{BILLING_SETUP,KIOSK_SETUP,INTEGRATION_GUIDE,TRINITY_DESIGN_UPDATE,todo}.md

2026-10-05 13:08
## Session end (claude-code)
- Summary: /go sync; reviewed Jon's redesign branches (origin/design-jon-v1, design-jon-v2): a static Ivory House marketing index.html only, with no admin dashboard design and no tablet changes. User wants his site and dashboard designs while keeping our tablet. On standby per the user ("don't change anything"). Plan when unblocked: port into src/views/landing.html, not a git merge. Handoff overwritten.
- Files: MGR/sessions/handoff.md, MGR/sessions/latest.md (no code changes)

2026-10-08 07:55
## Checkpoint (claude-code)
- session report: completed + remaining
- **Completed (2026-10-07 → 08):**
  - Wired every stubbed dashboard function: admin Edit company + real stats, billing CSV export, invoice PDF (pdfkit), helpdesk (company tickets + admin inbox), help guide, live Guest reports card, `/login` (no slug prompt), nodemailer SMTP + urgent-report email
  - Cleanup: proxy-addr audit fix (prod 0 vulns), separate admin session key, logout no longer wipes storage (tablet pairing), debug code removed, host-tolerant diagnostics test
  - G7 Ops add-on, all 9 stages of docs/G7_OPS_PLAN.md: workers/invites/`/maint` app, work orders + cost approval, encrypted access codes + QR check-in + private photos, checklists + review queue, offline queue + web push, vendor insurance certificates, time & pay CSV, preventive schedules + digests + admin metrics, Stripe Ops item
  - Tests: tests/e2e/admin-functions + ops-s1…s9 (all in `npm test`); last full runs green suite by suite; final consolidated run was still in progress at commit time (green through analytics)
  - Committed `c194330` on new branch `feature/g7-ops` (not merged, not pushed). `public/img/hero-pool.jpg` left untracked (unused per 2026-10-06 notes)
- **Remaining:**
  - Launch config: OPS_PRICE_MONTHLY + STRIPE_PRICE_OPS_MONTHLY (`npm run stripe:setup`), OPS_SECRET_KEY, VAPID keys, SMTP creds, SUPPORT_EMAIL
  - #45 MySQL staging: apply migrations 1–17 (README order) and run the suites against real MySQL (everything so far tested in mock mode)
  - #46 production deploy prep; #42 Stripe dashboard config; #43 Trinity design pass (now also the new Ops/helpdesk screens); #30 real Tab A11+ check; #31 tile row; #33 pairing errors; #34 yarn.lock (npm changed it again); #12–#14, #16, #25 backlog
  - Replace the placeholder `public/img/hero-devices.{png,webp}` (another brand's UI) with `hero-devices-stayguide.*` before launch
  - Merge/PR `feature/g7-ops` → main when ready
- Note: in-code `// 2026-10-08 HH:MM` stamps added after ~07:00 today are approximate (some read later than the real time)

2026-10-08 11:07
## Checkpoint (claude-code)
- /go: copied the 2026-10-08 08:12 handoff (written outside the repo while Desktop access was blocked) into the handoff file
- #31 done: tablet tiles flex + centered; Report tile (inside .report-card) gets the same basis, all 7 tiles 263 px (design-test 326/326)
- #33 done: PAIRING_FORMAT/EXPIRED/USED/INVALID errors + migration 2026-10-08_device_pairing_reasons.sql (step 18); phase3-test green
- Landing hero now /img/hero-devices-stayguide.* (regenerated, centered tiles); placeholder hero-devices.* (other brand) git rm'd; pricing-test 16/16
- #34 done: yarn.lock git rm'd
- tasks.json (#31/#33/#34 done, #45 → 18 migrations), worklog, notes.txt, docs/todo.md updated. Not committed yet
- Next: #45 real MySQL (stayguide_dev, 18 migrations, suites with MOCK_DATABASE=false)
- Note: mgr upgraded the protocol to v3 at ~11:00 (MGR/projects/stayguide/); task/worklog/notes edits above carried over. Stray copy of this entry left at old path MGR/sessions/latest.md

2026-10-08 12:15
## Checkpoint (claude-code)
- #45 done: pre-migration schema + 18 migrations == fresh schema.sql on MySQL 9.3 (3 index names aligned in schema.sql)
- Real-MySQL bugs fixed in src/utils/database.ts: session time_zone '+00:00' (NOW() vs UTC JS dates off by the offset), decimalNumbers (DECIMAL came back as strings), dateStrings DATE
- New: scripts/seed-mysql-from-mock.js, scripts/test-mysql.js, npm run test:mysql; suites honor TEST_MOCK_DATABASE
- #31 follow-up: phone tiles flex-grow so a lone last tile spans the row
- Results: MySQL 20/20 suites; mock npm test all green (unit 24/24, design 326/326, …)
- Local DBs: stayguide_dev (test target), stayguide_migtest (can be dropped)
- Not committed. Next: commit on feature/g7-ops, PR → main, #46 deploy prep

2026-10-09 09:24
## Checkpoint (claude-code)
- #46 code side done (task stays pending for the server steps): src/utils/production-check.ts refuses a production start on old Node, weak JWT_SECRET, MOCK_DATABASE=true, non-https APP_BASE_URL, bad OPS_SECRET_KEY, Stripe without webhook secret; warns on test Stripe key, TRUST_PROXY, mock email, VAPID, SUPPORT_EMAIL
- database.ts honors DB_PORT; secret-box exports parseOpsKey
- .env.production.example rewritten (all settings); .env.example + MOCK_DATABASE/DB_PORT/APP_BASE_URL
- DEPLOYMENT_GUIDE.md rewritten as the single Plesk checklist; plesk-deploy.md + database/DEPLOYMENT_GUIDE.md point to it
- Tests: unit 28/28; mock npm test all green; MySQL 20/20 (billing-test once took ~39 min in the mock run but passed; 27s on MySQL, not investigated)
- Not committed, not pushed. Next: commit, push + PR feature/g7-ops → main (needs user OK), then server steps per DEPLOYMENT_GUIDE.md

2026-10-09 12:38
## Checkpoint (claude-code)
- PRD audit (StayGuide-PRD.md vs code): MVP ~85% met; gaps logged as tasks #56–#61
- #56 done: forgot/reset/change password for all roles; sessions before a change are rejected (users.password_changed_at); migration 19 (2026-10-09_password_resets.sql); password-test 33/33 mock + MySQL
- #61 done: several admins per company (Team page Admins card, super admin Admins dialog, /company/<slug>/admins API); super admin table shows plan/properties/admins and escapes names; tenancy-test 34/34 incl. 63 cross-company probes, mock + MySQL
- Mock user lookup now case-insensitive and skips deactivated users (like MySQL)
- Open from audit: #57 tablet shows stored restaurant/local fields, #58 TV codes/structured house info/rotating welcome, #59 prod hygiene (auth email logging, CSP, CORS), #60 Phase 2
- Not committed, not pushed (#46 work also uncommitted)

2026-10-09 13:12
## Checkpoint (claude-code)
- MySQL sessions now TIME_TRUNCATE_FRACTIONAL (rounding made a fresh check-in "in the future"; flaky ops-s7); ops-s8 UI pause wait fixed (raced an earlier paused row)
- Full runs: mock npm test 22/22 green; MySQL 21/22 then fixes, affected suites 3x green
- Saved memory: run date before writing code-comment timestamps (rewrote invented 13:xx stamps to real 12:xx)

2026-10-10 10:40
## Checkpoint (claude-code)
- #62 done: presence at the property. Crew check-in/out (button, QR, Start, Submit) carries a GPS reading + distance; arrival / leaving prompt in /maint; property spot (pin, maps link, or learned from a precise QR check-in); arrived/left emails (Team page switch) and late/no-show alerts (5-min tick); "On site now" on the board, Where column on Time; dashboard cards show crew on site + anonymous guest activity; optional guide "Are you at …?" (stored only as yes/no)
- Migration 20 (2026-10-10_presence.sql); presence-test 65/65 mock + MySQL; unit 45/45
- Background detection with the app closed needs a native app (not done); told the user up front
- Comment stamps again ran ahead of the clock (10:30–11:45 at 10:28); rewritten to 10:28, every later batch took `date` first
- Not committed, not pushed (#46, #56, #61, #62 all uncommitted)

2026-10-10 11:49
## Checkpoint (claude-code)
- #62 regression: MySQL 23/23 suites, mock npm test all green (unit 45/45, presence 65/65)
- design-test "Find from address" missed its fixed 800 ms wait once the dashboard loaded presence (mock requests ~1 s each): editor reuses the cards' data, one presence request at a time, test waits for the answer
- Not committed, not pushed
