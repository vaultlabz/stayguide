# StayGuide launch: your to-do list

<!-- 2026-10-22 11:43, launch audit follow-up: the steps only the owner can do (accounts, server, legal). Code-side work is done
     unless a step says otherwise. Details live in DEPLOYMENT_GUIDE.md and docs/BILLING_SETUP.md; this is the order to do them in. -->

Operator: **Wingu Digital**, New Mexico. Main domain: **stayguide.pro**; **stayguidepro.app** redirects to it (2026-10-22 16:22).
Tick boxes as you go. Tasks in `MGR/projects/stayguide/tasks.json` are in brackets.

---

## 1. Decisions (5 minutes)

- [ ] **Exact legal name** for the Terms/Privacy pages: "Wingu Digital" or "Wingu Digital LLC" (as registered with the NM Secretary of State). Goes in `LEGAL_NAME` [#63]
- [x] **Production domain**: `stayguide.pro` (main, `APP_BASE_URL`, Stripe webhook, uptime monitor); `stayguidepro.app` 301-redirects to it
- [ ] **Support address** (e.g. `support@stayguide.pro`) for `SUPPORT_EMAIL`, shown on /terms and /privacy
- [ ] **Stripe account**: keep using the Wingu Digital account with StayGuide branding, **or** add a separate "StayGuide" account under the same login (Stripe → account menu → *New account*). Separate is cleaner if Wingu Digital bills other products on Stripe [#42]
- [ ] **Alert inbox**: which email gets error alerts (`ALERT_EMAIL`), and who receives uptime alerts on their phone [#64]

## 2. Code: merge to main

- [ ] Review and merge **PR #3** (https://github.com/vaultlabz/stayguide/pull/3) into `main`. The server deploys from `main`

## 3. Legal review [#63]

- [ ] Have a lawyer (or a reviewed template service) check `/privacy` and `/terms`. Text: `src/views/privacy.html`, `src/views/terms.html`
- [ ] Confirm the promises match how you will operate:
  - account data deleted within **90 days** after an account closes (built, #66: super admin → Companies → Close… ; the data is purged automatically 60 days later, `ACCOUNT_PURGE_DAYS`)
  - server logs kept up to **90 days**, backups roll over within **30 days** (set up in step 6)
  - price changes announced **30 days** ahead; export offered within **30 days** of closing
  - liability capped at 12 months of fees; New Mexico law and courts
- [ ] If wording changes in a way users must re-accept, tell Claude to bump `TERMS_VERSION`

## 4. Stripe live mode [#42] (docs/BILLING_SETUP.md)

Do this in the dashboard with **Test mode OFF**.

- [ ] **Products and prices**: create the 7 prices (live mode does not copy test prices automatically; use *Copy to live mode* on each product, or create them):
  Pro $9.99/property/month · Pro $89/property/year · Portfolio $32/5-property block/month · Desk bundle $39/month · Wall bundle $49/month · Desk kit $399 one-time · Wall kit $699 one-time. Copy each `price_...` id
- [ ] **Payment methods** (Settings → Payment methods): Cards **on**, ACH Direct Debit **on**, Bank transfers **on**
- [ ] **Customer Portal** (Settings → Billing → Customer portal):
  - update payment methods, view invoices: on
  - cancel subscriptions: on, **at end of billing period**
  - switch plans: on, with Pro monthly, Pro annual and Portfolio as the allowed products/prices
  - links to your Terms (`https://stayguide.pro/terms`) and Privacy (`/privacy`)
- [ ] **Branding** (Settings → Branding, and Settings → Business → Public details): public business name **StayGuide**, icon/logo, brand color (teal `#1d6b60`), support email, statement descriptor e.g. `STAYGUIDE`. This replaces the "Wingu Digital" you see in the sandbox
- [ ] **Webhook** (Developers → Webhooks → Add endpoint): `https://stayguide.pro/billing/webhook` with events
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
  `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
  Copy the **signing secret** (`whsec_...`)
- [ ] **API key**: Developers → API keys → copy the live **secret key** (`sk_live_...`). Keep it only in the server `.env` and your password manager

## 5. Server setup [#46] (DEPLOYMENT_GUIDE.md §1–7)

- [ ] `stayguide.pro` points at the Plesk server; SSL on (Let's Encrypt) with HTTP → HTTPS redirect; `www.stayguide.pro` redirects to the bare domain
- [ ] `stayguidepro.app`: add in Plesk as a forwarding domain, **301** to `https://stayguide.pro`, with its own Let's Encrypt certificate (.app only works over HTTPS). Do not run the Node app on it too (links and sessions would split)
- [ ] Email DNS on `stayguide.pro`: SPF, DKIM (Plesk → Mail → turn on DKIM) and a DMARC record (start with `v=DMARC1; p=none; rua=mailto:<your inbox>`), so guest-report and invite emails don't land in spam
- [ ] Plesk Node.js with **Node 20.9+**; a MySQL 8+ database + its own user
- [ ] Sending mailbox + SMTP details (e.g. `noreply@stayguide.pro`)
- [ ] Code via Plesk Git from `main`, then `npm ci && npm run build:clean`
- [ ] `.env` from `.env.production.example`, filled in. Generate secrets with `openssl rand -hex 32`:
  - `NODE_ENV=production`, `APP_BASE_URL=https://stayguide.pro`, `TRUST_PROXY=1`, `MOCK_DATABASE=false`, `DB_*`
  - `JWT_SECRET`, `OPS_SECRET_KEY` (**save `OPS_SECRET_KEY` in the password manager**: door codes can't be read without it)
  - `EMAIL_PROVIDER=smtp`, `SMTP_*`, `FROM_EMAIL`, `SUPPORT_EMAIL`
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the 7 `STRIPE_PRICE_*` from step 4
  - VAPID keys: `npx web-push generate-vapid-keys` (once, never change)
  - `LEGAL_NAME`, `LEGAL_JURISDICTION=New Mexico`, `ALERT_EMAIL`
- [ ] Database: fresh install = `database/schema.sql`; existing database = back up, then migrations **1–22** in the order in `database/migrations/README.md`
- [ ] Change the super admin email + password (DEPLOYMENT_GUIDE §4)
- [ ] Plesk Node.js app: startup file `dist/index.js`, document root `<app>/public`, mode production → restart. The log must show `StayGuide server running` and no `[config] error:`. Fix any `[config] warning:` you did not expect

## 6. Backups and log retention [#65] (DEPLOYMENT_GUIDE.md §8a–8d)

- [ ] Plesk Backup Manager: remote storage (S3 / Backblaze / SFTP) → daily 03:00, all content, keep **30 days**, **password-protected**, email on error. Run one backup by hand
- [ ] `~/.stayguide-backup.cnf` (chmod 600) + Scheduled Task `bash <app>/scripts/backup-mysql.sh` daily 02:30. Run it once by hand
- [ ] Log rotation: daily, keep **90**, compress
- [ ] **Restore test** (§8d) and note the date + row counts in task #65

## 7. Monitoring [#64] (DEPLOYMENT_GUIDE.md §8e)

- [ ] UptimeRobot or Better Stack (free): HTTP(s) monitor on `https://stayguide.pro/api/health`, every 5 minutes, alerts by email + phone app
- [ ] Test it: stop the Node.js app in Plesk ~6 minutes → alert arrives → start it → recovery alert
- [ ] `ALERT_EMAIL` set (step 5). Error emails start automatically in production

## 8. Smoke test (DEPLOYMENT_GUIDE.md §7)

- [ ] `https://stayguide.pro/api/health` → `"database":"connected"`; `http://` redirects to `https://`
- [ ] `/privacy` and `/terms` show Wingu Digital and New Mexico
- [ ] Sign up on `/signup` (the Terms checkbox is required) → Billing → Pro → pay with a **real card** → plan shows **Active** → refund it in Stripe
- [ ] Pair a tablet, open the phone guide link, file a guest report → the urgent report email arrives
- [ ] Ops: invite a worker, sign in on a phone, enable push, upload a job photo
- [ ] Customer Portal opens from Billing → Manage billing, showing StayGuide branding

## 9. Before selling tablet kits [#30]

- [ ] Run the tablet app on a real **Galaxy Tab A11+** in Fully Kiosk: smooth transitions/blur, pairing, offline after Wi-Fi off, `/tablet/diagnostics` all pass

## 10. After launch

- [ ] Restore test every 3 months (§8d)
- [ ] Send Trinity the new screens (signup checkbox, legal pages, billing) for the design pass [#43]
- [ ] Decide when to build: Stays/Conversions API for owners' booking sites [#25], tablet restaurant/local data [#57], TV codes / house info [#58]

---

**Claude can still build** (ask any time): #57, #58, #25, and the owner vs management-company design once you answer its 3 questions.
