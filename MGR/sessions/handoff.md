updated: 2026-10-05 13:08
tool: claude-code
branch: main (design branch merged via PR #1; worktree ../stayguide-design still exists)

## Focus

Jon's "Ivory House" redesign (`origin/design-jon-v2`) is on standby: the user and Jon are still editing it. Until then, same plan as before: Stripe dashboard config (#42), real-MySQL verification (#45), then plan G7.

## Active tasks

Each pending task in `MGR/tasks.json` has `context`: doing, achieve, according.

- [ ] (42) — Stripe dashboard config: Bank transfers, Customer Portal plan switching + cancel at period end, StayGuide branding — *high*
- [ ] (45) — Verify on real MySQL: apply the 9 migrations to staging (order in database/migrations/README.md) and run the e2e suites against it — *high*
- [ ] (41) — G7: Field/maintenance web app (Ops add-on): own plan before build
- [ ] (43) — Trinity design pass on new screens (docs/TRINITY_DESIGN_UPDATE.md)
- [ ] (44) — Company sign-in screen (replace prompt())
- [ ] (46) — Production deploy prep (HTTPS, Node ≥ 20.9, APP_BASE_URL, TRUST_PROXY=1, live Stripe, webhook endpoint, migrations)
- [ ] (25) — External API v1 (Stays, Conversions, webhooks), spec in docs/INTEGRATION_GUIDE.md
- [ ] (12, 13, 14, 15, 16, 17) — older backlog: admin amenities UI, real-time alerts, advanced analytics, email alerts, manager mobile app, helpdesk
- [ ] (30) — Real-device check on Galaxy Tab A11+ · (31) center 4+3 tile row · (33) clearer pairing errors · (34) stale yarn.lock

## Done this session

- /go sync; Obsidian note refreshed
- Reviewed Jon's branches `origin/design-jon-v1` and `design-jon-v2` (fetched; no local changes, nothing merged)

(Previous session, 2026-10-05 08:20: G0–G6 guest product shipped; see latest.md)

## Next

1. In Stripe (test mode): enable Bank transfers, configure the Customer Portal, set StayGuide branding (#42)
2. Stand up a MySQL staging DB, apply `database/migrations/*` in the order listed in database/migrations/README.md, run `npm test` against it (#45)
3. Plan G7 (maintenance/field app): decide the Ops price, vendor access model, checklists, photo storage, notifications, offline needs
4. Send Trinity the update link (contact channel unknown; ask the user)
5. When the user says go: port Jon's marketing design into `src/views/landing.html`, and his admin dashboard design once it exists (see notes)

## Blockers

- Trinity's contact channel is unknown (the doc is in the repo)
- Email transport not wired (nodemailer missing; task #15), which blocks invoice and alert emails from StayGuide itself (Stripe sends its own)

## Notes for next agent

- Tests: `PLAYWRIGHT_CHROMIUM_PATH=~/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell npm test`. The suites start their own server on port 3917 (billing also uses 3919 for a fake Stripe)
- `.env` (git-ignored) holds the Stripe **test** key, webhook secret (from `stripe listen --print-secret`) and price IDs. Never use the live key in ~/Desktop/ctrl/master.txt
- Local webhooks: `stripe listen --api-key <test key> --forward-to localhost:3000/billing/webhook`
- Migrations to apply (9): follow the order in database/migrations/README.md (filename order is wrong for same-date files)
- Existing companies are grandfathered as Pro (`subscription_status = 'legacy'`) by the plans_billing migration

### Jon's redesign (design-jon-v2), 2026-10-05

- The user wants Jon's **main site design** and **admin dashboard design**, and wants to **keep our tablet design**. Status: **standby**. The user said "don't change anything" while they keep editing with Jon.
- Branch forks from old `design` @ d9ddc57. It only adds a static root `index.html` (15.6 MB, images embedded as data URIs), `screenshots/`, a README hero and a stray `probe-tmp.txt`. Tablet untouched.
- **No admin dashboard design exists yet** on design-jon-v1 or v2 ("we'll implement soon").
- Plan when unblocked: do not git-merge. Rebuild `src/views/landing.html` in his style: extract images to `public/img/`, reuse his CSS, keep the server-rendered pricing from `src/config/plans.ts` and the signup CTAs.
- Copy: keep Jon's copy as-is (user decision). It markets unbuilt features (task automation, cleaner checklists, owner portal, PMS, Estate tier, demo form). Its v2 pricing shows placeholders (Free/Core/Pro/Estate); his v1 commit c07f260 had Free $0 / Pro $9.99 / Portfolio $32, which matches plans.ts.
- The `../stayguide-design` worktree is merged and can be removed.
