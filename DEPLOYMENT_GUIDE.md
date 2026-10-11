# StayGuide production deploy (Plesk)

<!-- 2026-10-09 08:35, #46: rewritten. Replaces the older guide (Node 18, init.sql demo logins, manual nodemailer step)
     and the separate plesk-deploy.md / database/DEPLOYMENT_GUIDE.md, which now point here. -->

The server checks its own settings at startup. With `NODE_ENV=production` it **refuses to start** while a required
value is missing or a placeholder, and lists what to fix in the Node.js log. Optional gaps are logged as `[config] warning:`.

## 1. Host prerequisites

- [ ] Domain points at the Plesk server, **Let's Encrypt (or other) SSL on**, "Permanent 301 redirect from HTTP to HTTPS" ticked
- [ ] Plesk Node.js extension with **Node 20.9 or newer** (`package.json` `engines`; the startup check enforces it)
- [ ] A MySQL 8+ database and a dedicated user with full rights on that database only
- [ ] A mailbox for sending (e.g. `billing@yourdomain.com`) and its SMTP details

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
| `APP_BASE_URL` | `https://yourdomain.com` (emails, guest links, QR codes, Stripe redirects) |
| `TRUST_PROXY` | `1` (warning only, but needed behind Plesk nginx for correct rate limits) |
| `MOCK_DATABASE` | `false` |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | from Plesk → Databases |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `OPS_SECRET_KEY` | `openssl rand -hex 32`, **store a copy in your password manager** (encrypted access codes are unreadable without it) |
| `STRIPE_WEBHOOK_SECRET` | required as soon as `STRIPE_SECRET_KEY` is set (step 6) |

Also set (warnings if missing): `EMAIL_PROVIDER=smtp` + `SMTP_*`, `SUPPORT_EMAIL`, VAPID keys
(`npx web-push generate-vapid-keys`, generate once and never change them, or every worker must re-enable push).

## 4. Database

**New database:** import `database/schema.sql` only (it already includes every migration). Do **not** run
`database/init.sql` (demo logins `admin123` / `demo123`). Then set the super admin password:

```bash
node -e "require('bcryptjs').hash(process.argv[1], 12).then(console.log)" 'YOUR-NEW-PASSWORD'
```

```sql
UPDATE users SET email = 'you@yourdomain.com', password_hash = '<hash from above>' WHERE role = 'super_admin';
```

**Existing database:** back it up, then apply the migrations in `database/migrations/` **in the order listed in its README**
(20 steps; the filename order is not the apply order). Each runs once. Verified on MySQL 9.3 (task #45).

## 5. Plesk Node.js app

- Application root: the app folder; **Document root: `<app folder>/public`** (static files are also served by Node)
- Application startup file: `dist/index.js`
- Application mode: `production`
- Restart the app, then open the log: you want `StayGuide server running` and no `[config] error:` lines

## 6. Stripe live mode (docs/BILLING_SETUP.md)

1. Switch the dashboard to live mode and create the same products/prices as in test mode (BILLING_SETUP §1; `npm run stripe:setup`
   only accepts test keys, so copy the products to live mode in the dashboard)
2. Paste `sk_live_...` into `STRIPE_SECRET_KEY` and every `STRIPE_PRICE_*`
3. Developers → Webhooks → add `https://yourdomain.com/billing/webhook` with the events in BILLING_SETUP §4; paste its signing secret
   into `STRIPE_WEBHOOK_SECRET`
4. Payment methods, Customer Portal and branding as in BILLING_SETUP §2–3 (task #42)

## 7. Smoke test

```bash
curl -s https://yourdomain.com/api/health        # {"status":"healthy",...,"database":"connected"}
curl -sI http://yourdomain.com | head -1          # 301 to https
```

- [ ] Log in at `/admin/login` as the super admin
- [ ] Self-serve signup on `/signup` → Stripe Checkout (live card, then refund) → plan shows Active (webhook arrived)
- [ ] Pair a tablet (open `/tablet` on it, enter a code from the property's Devices page), open the guest phone link, file a guest report → urgent report email arrives
- [ ] Ops: invite a worker, sign in on a phone, enable push, upload a job photo
- [ ] Log shows no `[config] warning:` you did not expect

## 8. Afterwards

- Nightly MySQL backup (Plesk → Backup Manager) including `public/uploads/` and `storage/ops/`
- Keep `.env` out of git (it is ignored); rotate `JWT_SECRET` only knowing that it signs everyone out
- Redeploy: pull, `npm ci && npm run build:clean`, apply any new migrations from the README, restart
