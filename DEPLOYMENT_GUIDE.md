# StayGuide production deploy (Plesk)

<!-- 2026-10-09 08:35, #46: rewritten. Replaces the older guide (Node 18, init.sql demo logins, manual nodemailer step)
     and the separate plesk-deploy.md / database/DEPLOYMENT_GUIDE.md, which now point here. -->

The server checks its own settings at startup. With `NODE_ENV=production` it **refuses to start** while a required
value is missing or a placeholder, and lists what to fix in the Node.js log. Optional gaps are logged as `[config] warning:`.

## 1. Host prerequisites

- [ ] Domain points at the Plesk server, **Let's Encrypt (or other) SSL on**, "Permanent 301 redirect from HTTP to HTTPS" ticked
- [ ] Plesk Node.js extension with **Node 20.9 or newer** (`package.json` `engines`; the startup check enforces it)
- [ ] A MySQL 8+ database and a dedicated user with full rights on that database only
- [ ] A mailbox for sending (e.g. `billing@stayguide.pro`) and its SMTP details

## 2. Get the code on the server

Recommended: Plesk **Git** extension pulling `main` from GitHub into the domain folder (not `httpdocs` itself; see step 5).
Then in the Plesk Node.js screen (or SSH, in the app folder):

```bash
npm ci                 # needs dev dependencies for the TypeScript build
npm run build:clean    # dist/ with views
```

Keep these folders across deploys (they hold user data, not code): `public/uploads/`, `storage/ops/` (or `OPS_STORAGE_DIR`).

## 3. Settings

Copy `.env.production.example` to `.env` in the app folder (or enter the same values in Plesk's environment variables) and fill
everything in. Required at startup:

| Setting | Value |
|---|---|
| `NODE_ENV` | `production` |
| `APP_BASE_URL` | `https://stayguide.pro` (emails, guest links, QR codes, Stripe redirects) |
| `TRUST_PROXY` | `1` (warning only, but needed behind Plesk nginx for correct rate limits) |
| `MOCK_DATABASE` | `false` |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | from Plesk → Databases |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `OPS_SECRET_KEY` | `openssl rand -hex 32`, **store a copy in your password manager** (encrypted access codes are unreadable without it) |
| `STRIPE_WEBHOOK_SECRET` | required as soon as `STRIPE_SECRET_KEY` is set (step 6) |

Also set (warnings if missing): `EMAIL_PROVIDER=smtp` + `SMTP_*`, `SUPPORT_EMAIL`, VAPID keys
(`npx web-push generate-vapid-keys`, generate once and never change them, or every worker must re-enable push).
Leave `CORS_ORIGINS` empty unless another website must call the API from a browser.

## 4. Database

**New database:** import `database/schema.sql` only (it already includes every migration). Do **not** run
`database/init.sql` (demo logins `admin123` / `demo123`). Then set the super admin password:

```bash
node -e "require('bcryptjs').hash(process.argv[1], 12).then(console.log)" 'YOUR-NEW-PASSWORD'
```

```sql
UPDATE users SET email = 'you@stayguide.pro', password_hash = '<hash from above>' WHERE role = 'super_admin';
```

**Existing database:** back it up, then apply the migrations in `database/migrations/` **in the order listed in its README**
(22 steps; the filename order is not the apply order). Each runs once. Verified on MySQL 9.3 (task #45).

## 5. Plesk Node.js app

- Application root: the app folder; **Document root: `<app folder>/public`** (static files are also served by Node)
- Application startup file: `dist/index.js`
- Application mode: `production`
- Restart the app, then open the log: you want `StayGuide server running` and no `[config] error:` lines

## 6. Stripe live mode (docs/BILLING_SETUP.md)

1. Switch the dashboard to live mode and create the same products/prices as in test mode (BILLING_SETUP §1; `npm run stripe:setup`
   only accepts test keys, so copy the products to live mode in the dashboard)
2. Paste `sk_live_...` into `STRIPE_SECRET_KEY` and every `STRIPE_PRICE_*`
3. Developers → Webhooks → add `https://stayguide.pro/billing/webhook` with the events in BILLING_SETUP §4; paste its signing secret
   into `STRIPE_WEBHOOK_SECRET`
4. Payment methods, Customer Portal and branding as in BILLING_SETUP §2–3 (task #42)

## 7. Smoke test

```bash
curl -s https://stayguide.pro/api/health        # {"status":"healthy",...,"database":"connected"}
curl -sI http://stayguide.pro | head -1          # 301 to https
curl -sI https://stayguidepro.app | head -1      # 301 to https://stayguide.pro (second domain)
```

- [ ] Log in at `/admin/login` as the super admin
- [ ] Self-serve signup on `/signup` → Stripe Checkout (live card, then refund) → plan shows Active (webhook arrived)
- [ ] Pair a tablet (open `/tablet` on it, enter a code from the property's Devices page), open the guest phone link, file a guest report → urgent report email arrives
- [ ] Ops: invite a worker, sign in on a phone, enable push, upload a job photo
- [ ] Log shows no `[config] warning:` you did not expect

## 8. Backups, log retention and monitoring (tasks #65, #64)

<!-- 2026-10-22 11:33, #65: replaces the one-line backup note. Retention numbers match the Privacy Policy (/privacy):
     backups roll over within 30 days, server logs kept up to 90 days. Change both together. -->

**What holds data** (everything else can be rebuilt from git):

| What | Where | Why it matters |
|---|---|---|
| MySQL database | `DB_NAME` | accounts, properties, guides, jobs, time entries, billing state |
| Uploaded images | `<app>/public/uploads/` | property photos, backgrounds |
| Ops files | `<app>/storage/ops/` (or `OPS_STORAGE_DIR`) | job photos, vendor insurance certificates |
| `.env` | `<app>/.env` | **`OPS_SECRET_KEY` is the only way to read stored door/access codes.** Lose it and every code must be re-entered |

Also keep `.env` (at least `OPS_SECRET_KEY`, `JWT_SECRET`, `DB_PASSWORD`, Stripe keys) in the Wingu Digital password manager, apart from the server.

### 8a. Plesk Backup Manager: nightly, off the server

1. **Remote storage first** (a backup on the same disk dies with the disk): Plesk → *Tools & Settings → Backup Manager →
   Remote Storage Settings*. SFTP/FTP is built in; Amazon S3, Backblaze B2 (S3-compatible), Google Drive etc. come as
   extensions (*Extensions → search "backup"*). Use a bucket/folder only for StayGuide, with a key that can write it.
2. *Websites & Domains → (the StayGuide subscription) → Backup & Restore → Schedule*:
   - **Activate this backup task**, run **daily at 03:00** (server time)
   - Store in: **remote storage** (tick server storage too if disk space allows: faster restores)
   - Back up: **all configuration and content** (websites + databases; covers the app folder, so `public/uploads/`,
     `storage/ops/` and `.env`). If `OPS_STORAGE_DIR` points outside the subscription, back that folder up too
   - Type: full weekly + incremental daily is fine; **keep 30 days** at most (retention field: "Maximum number of
     full backup files" / "Keep backups for", depending on the Plesk version). The Privacy Policy says backups roll over within 30 days
   - **Use password protection**: the backup contains `.env` and customer data. Store that password in the password manager
   - Exclude log files; **send a notification email** on errors to the support address
3. Click **Back Up** once now to create the first backup; check it appears under remote storage with a plausible size.

### 8b. Second nightly copy: `scripts/backup-mysql.sh`

A consistent `mysqldump` (no table locks) plus a tar of uploads, Ops files and `.env`, kept 14 days in `~/stayguide-backups`
(mode 700). It is independent of Plesk's format, so a restore needs only `gunzip | mysql`, and the script fails loudly if the dump is incomplete.

```bash
# once, over SSH as the subscription user
cat > ~/.stayguide-backup.cnf <<'CNF'
[client]
user=<DB_USER>
password=<DB_PASSWORD>
host=localhost
CNF
chmod 600 ~/.stayguide-backup.cnf
bash <app folder>/scripts/backup-mysql.sh      # test run: prints the dump path and size
```

Then Plesk → *Websites & Domains → Scheduled Tasks → Add Task*: **Run a command**, `bash <app folder>/scripts/backup-mysql.sh`,
**daily 02:30** (before the Plesk backup, so the 03:00 backup also carries tonight's dump offsite), notify on errors.

### 8c. Log retention (90 days)

*Websites & Domains → Logs → Log Rotation* (or *Manage Log Files*): **on**, rotate **daily**, **keep 90** files,
**compress**. The access log already masks guide-link, invite and scan tokens and drops query strings (#59).
The Node.js app's own output goes to the log shown on the Node.js screen; check that file is rotated too (*Logs* lists it).

### 8d. Restore test (do once before launch, then every 3 months)

A backup is only proven by restoring it. Over SSH:

```bash
F=$(ls -t ~/stayguide-backups/db_*.sql.gz | head -1)
mysql --defaults-extra-file=~/.stayguide-backup.cnf -e "CREATE DATABASE stayguide_restore_test"   # or Plesk → Databases → Add
gunzip -c "$F" | mysql --defaults-extra-file=~/.stayguide-backup.cnf stayguide_restore_test
Q="SELECT (SELECT COUNT(*) FROM companies),(SELECT COUNT(*) FROM users),(SELECT COUNT(*) FROM properties),(SELECT COUNT(*) FROM work_orders),(SELECT COUNT(*) FROM time_entries)"
mysql --defaults-extra-file=~/.stayguide-backup.cnf -N "$DB_NAME" -e "$Q"                 # live
mysql --defaults-extra-file=~/.stayguide-backup.cnf -N stayguide_restore_test -e "$Q"     # restored: same or slightly lower
tar -tzf $(ls -t ~/stayguide-backups/files_*.tar.gz | head -1) | grep -c uploads          # files are there
mysql --defaults-extra-file=~/.stayguide-backup.cnf -e "DROP DATABASE stayguide_restore_test"
```

(The database user needs rights on `stayguide_restore_test`; in Plesk, add the database first and grant the same user.)
Then check the **offsite** copy: Backup Manager → the latest remote backup → **Download** works and opens with the
backup password. Write the date and the counts into task #65 / the session log.

### 8e. Uptime monitor and error alerts (task #64)

<!-- 2026-10-22 11:37, #64 -->
- **Error emails are built in**: 5xx responses, crashes and failed Ops background jobs email `ALERT_EMAIL` (falls back to
  `SUPPORT_EMAIL`, then `ADMIN_EMAIL`). The first error mails at once; further errors within 15 minutes come as one summary.
  On by default in production (`ALERTS=off` turns it off). They go out through the normal SMTP settings, so if email
  is broken, alerts are too. That is why an outside monitor is needed as well
- **Outside uptime monitor** (a crashed server or dead host can't email anyone): a free UptimeRobot or Better Stack
  account → new **HTTP(s)** monitor → `https://stayguide.pro/api/health`, every **5 minutes**, alert by email + phone app.
  The endpoint runs a real database query: it answers **200** `"database":"connected"`, or **503** `"database":"unreachable"`
  when MySQL is down, so the monitor catches database outages too. Optional: keyword monitor for `"healthy"`
- Test once: pause the Node.js app in Plesk for ~6 minutes → the monitor alerts; start it again → recovery alert

**If production is lost:** new server per steps 1–5 → put `.env` back → import the newest dump (or restore the Plesk
backup) → copy `public/uploads/` and `storage/ops/` back → start → smoke test (step 7).

## 9. Closing a customer account (task #66)

<!-- 2026-10-22 15:59, #66 -->
Super admin → Companies → **Close…** on the company's row:

1. **Download data export** if the customer asked for their data (JSON of everything they stored; door codes, device tokens and passwords are left out). Available until the purge.
2. **Close account**: cancels the Stripe subscription at once (no refund; wait until the paid period ends if that matters), blocks admin sign-in, unpairs tablets, stops guest links and QR codes, pauses workers. **Reopen account** undoes it (tablets must be paired again, the plan bought again).
3. The data is **purged automatically** `ACCOUNT_PURGE_DAYS` (default 60, keep ≤ 90 for the Privacy Policy) after closing, by the hourly scheduler. **Purge now** (type the slug) does it at once.

The purge deletes properties and all their content, uploaded images, guest reports, analytics, jobs, photos, time entries, checklists, schedules and helpdesk tickets; anonymizes the company row and its admins (plus workers who work for no other company). Billing records and hardware orders are kept for tax. Each step is in `system_audit_log` (`table_name = 'companies'`).

## 10. Afterwards

- Keep `.env` out of git (it is ignored); rotate `JWT_SECRET` only knowing that it signs everyone out
- Redeploy: pull, `npm ci && npm run build:clean`, apply any new migrations from the README, restart
