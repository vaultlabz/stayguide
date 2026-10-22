updated: 2026-10-12 02:33
tool: claude-code
branch: feature/g7-ops (ahead of main; last commits f401346 feat #46/#56/#61/#62, 04aacb5 chore(mgr); not pushed, no PR)

## Focus

#59 production hygiene is done and tested but NOT committed. Next: commit #59, then #42 (Stripe dashboard config, user does it; offer a checklist), then #46 server steps (go live).

## Active tasks

- [ ] (42) Stripe dashboard config: bank transfers, Customer Portal plan switching + cancel at period end, StayGuide branding (sandbox shows Wingu Digital). User does it in Stripe; offer a click-by-click checklist
- [ ] (46) Production deploy: code side done (startup config check, 20-step DEPLOYMENT_GUIDE.md). Remaining: server steps (HTTPS, Node ≥ 20.9, env values, live Stripe keys + webhook, run migrations 1–20)
- [ ] (57) Tablet shows captured restaurant/local data (images, ratings, meal tabs, local-info grouping, Maps QR)
- [ ] (58) PRD fields: TV/streaming codes, structured trash/parking/AC/pet info, rotating welcome messages
- [ ] (43) Trinity design pass on new screens · (30) real Galaxy Tab A11+ check · (60) PRD Phase 2 · backlog 12, 13, 14, 16, 25
- [ ] Owner vs management-company design (no task id yet): waiting on the user's 3 answers: pricing (one plan set or single-home tier), account type (chosen at signup or automatic by property count), order vs other work. Proposal: account_type for UI only, owner view opens the guide editor, features appear by property count / Ops, Owner/Manager column for super admin
- [ ] Push feature/g7-ops / PR to main (ask first)

## Done this session (2026-10-10 → 12)

- #62 Presence at the property: GPS check-in/out with distance, arrival/leave prompt, property location (pin / maps link / learned from QR), arrived/left + late/no-show emails, On site now, Where column, guest activity, optional guide on-site question; migration 20. Tests 65/65 mock + MySQL
- Committed #46/#56/#61/#62 (f401346) + mgr logs (04aacb5)
- #59: removed 47 per-request/read-only console.log lines (incl. user email on every request); CSP without 'unsafe-eval'; CORS only for CORS_ORIGINS (empty = none); access log masks query strings and /g/, invite, scan tokens, no referrer; 5xx generic in production; startup route list removed
- Bug fixed (found by the #59 run): dashboards (company + admin) kept the old token after a password change → 401 → logged out and new token deleted. apiCall reads saved token each call, retries once if replaced
- Tests after #59: all 23 mock suites green (run per suite; one-off flakes: Unsplash image load in offline-test, pricing server start > 30 s). MySQL not rerun for #59 (no DB changes)

## Next

1. Ask the user to OK committing #59 (files: src/index.ts, middleware/auth.ts, utils/auth.ts, services/*, controllers/Billing+Property, both dashboards, .env examples, DEPLOYMENT_GUIDE.md, docs/todo.md, MGR files)
2. #42 checklist for the user, then #46 server steps
3. Owner/manager design once the user answers

## Blockers

- #42 and #46 server steps need the user (Stripe dashboard, server access)
- Owner/manager design waits on the user's answers

## Notes for next agent

- Test browser: PLAYWRIGHT_CHROMIUM_PATH=~/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell (the default 1243 is not installed). MySQL runner: node scripts/test-mysql.js [suite…]
- Full npm test takes > 10 min; run in background or per suite
- Code comments: run date in the same command as each stamped edit (memory: real-timestamps-in-code-comments)
- Untracked, leave alone: .cursor/, MGR/sessions/, public/img/hero-pool.jpg
- Never commit .env; ask before commit/push/PR
