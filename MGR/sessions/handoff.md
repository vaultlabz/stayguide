updated: 2026-10-03 17:45
tool: claude-code
branch: main (also `design` in worktree ../stayguide-design)

## Focus

Review the tablet redesign on `design` (PR into `main`), then build content management (#32). Without it, MySQL-mode tablets have no restaurants, videos or local info.

## Active tasks

Each pending task in `MGR/tasks.json` has `context`: doing, achieve, according.

- [ ] (32) — Content management: restaurants, how-to videos, local info, announcements (+ PMS import adapter design) — *high*
- [ ] (25) — External API v1: company API keys, Stays, Conversions, signed webhooks (spec in docs/INTEGRATION_GUIDE.md §5–7)
- [ ] (12) — Admin dashboard: Properties & Amenities management section
- [ ] (13) — Real-time notifications for urgent issues
- [ ] (15) — Email notifications for urgent reports (EmailService not wired; nodemailer not installed)
- [ ] (17) — Helpdesk system (support tickets)
- [ ] (14) — Advanced analytics dashboards
- [ ] (16) — Native mobile app for property managers
- [ ] (33) — Clearer pairing errors (expired vs used vs invalid)
- [ ] (34) — Remove or regenerate stale yarn.lock
- On `design` only (until merged): (30) real-device check on Tab A11+; (31) center 4+3 home tile row

## Done this session

- mgr initialized; tasks seeded from docs/todo.md; full code audit
- Decision: web app + Fully Kiosk on managed tablets (not Flutter); GVR = complement via QR direct-booking/review links; smart-hardware = roadmap
- Phase 0 security (SQL field whitelist, tenant/amenity/report ownership), Phase 1 device pairing (/tablet, codes, hashed tokens), Phase 2 offline PWA, Phase 3 escaping + video modal + report form, Phase 4 docs/KIOSK_SETUP.md (incl. hardware specs), Phase 5 book-direct/review QR + /r redirects + link stats
- Deps: prod `npm audit` clean; sharp 0.35 → Node ≥ 20.9 (`engines`); 4 undefined-bind query bugs fixed; announcements shown on tablet
- docs/INTEGRATION_GUIDE.md v0.2 for owner-website developers
- Git: private repo github.com/vaultlabz/stayguide, branches main + design; jonbeatz has org admin access
- `design`: UI design system + light/dark themes; tablet redesign with icon-only home, glass UI, 8 Figma luxury gradients, clock + Open-Meteo weather, Wi-Fi join QR, ease-in transitions, blurred sheets (d9ddc57)

## Next

1. Open a PR `design` → `main`; review with jonbeatz; merge (MGR/tasks.json will merge #28–#31 cleanly: main uses #32+)
2. Test the redesign on a real Galaxy Tab A11+ in Fully Kiosk (#30)
3. Content management (#32): CRUD for restaurants / howto_videos / local_info / announcements in the company dashboard
4. Before first deploy: HTTPS, Node ≥ 20.9, APP_BASE_URL, TRUST_PROXY=1, run all files in database/migrations/ (main: 3; design adds tablet_theme, tablet_background, tablet_home)
5. Identify the "muse" agent the user asked to notify about the design push (not found locally)

## Blockers

- "muse" agent target unknown — ask the user where it lives
- MySQL paths are code-reviewed only (all tests ran in mock mode)

## Notes for next agent

- Tests: headless Chromium suites live in the session scratchpad (not in repo): offline 15, phase3 21, phase5 24, design 326. Consider moving them into the repo (`tests/e2e/`) so they persist.
- playwright-core: ~/.nvm/versions/node/v20.19.2/lib/node_modules/@playwright/cli/node_modules/playwright-core; browser: ~/Library/Caches/ms-playwright/chromium_headless_shell-1234/…/chrome-headless-shell (version mismatch, so pass executablePath)
- Worktree ../stayguide-design has a git-ignored copy of `.env` and a symlinked node_modules
- Figma MCP is authenticated (Luxury Gradients file vvZxGSsNrWLCILQJkV3aaY)
- An extra Obsidian note "stayguide-design" was created by a sync from the worktree; can be deleted
