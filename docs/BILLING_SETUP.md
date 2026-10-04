# Stripe Billing Setup

<!-- 2026-10-03 23:06, G3: what to configure in Stripe before self-serve billing goes live -->

StayGuide bills through **Stripe Checkout**, **Stripe Billing** (subscriptions), and the **Customer Portal**. Prices are locked in `src/config/plans.ts` (PRD §10). Stripe only needs matching Products/Prices, and the server reads their IDs from env vars.

Until `STRIPE_SECRET_KEY` is set, billing endpoints return **503 "Billing is not configured"** and the billing page shows a notice. Everything else works.

---

## 1. Create Products and Prices (test mode first)

**Shortcut for the sandbox:** with a test key in `.env`, run `npm run stripe:setup`. It creates all seven prices below (idempotent, using `lookup_key`s like `stayguide_pro_monthly`), refuses live keys, and prints the `STRIPE_PRICE_*` lines for `.env`. The sandbox was set up this way on 2026-10-03.

| Env var | Product | Price | Type |
|---|---|---|---|
| `STRIPE_PRICE_PRO_MONTHLY` | StayGuide Pro | **$9.99** per property / month | Recurring, per unit (quantity = properties) |
| `STRIPE_PRICE_PRO_ANNUAL` | StayGuide Pro | **$89** per property / year | Recurring yearly, per unit |
| `STRIPE_PRICE_PORTFOLIO_MONTHLY` | StayGuide Portfolio | **$32** per block of 5 properties / month | Recurring, per unit (quantity = ⌈properties ÷ 5⌉) |
| `STRIPE_PRICE_BUNDLE_DESK` | StayGuide Desk bundle | **$39** / month (counter tablet + Pro) | Recurring |
| `STRIPE_PRICE_BUNDLE_WALL` | StayGuide Wall bundle | **$49** / month (15.6" wall display + Pro) | Recurring |
| `STRIPE_PRICE_KIT_DESK` | StayGuide Desk kit | **$399** | One-time |
| `STRIPE_PRICE_KIT_WALL` | StayGuide Wall kit | **$699** | One-time |

StayGuide Signature (flush custom install) is quote-only and needs no price.

> If you change a price, create a **new** Price in Stripe and update the env var. Existing subscribers stay on their old price until migrated.

## 2. Payment methods (Dashboard → Settings → Payment methods)

Enable:
- **Cards**
- **ACH Direct Debit** (US bank accounts via Financial Connections). Lower fees (~0.8%, capped at $5) and suited to annual and portfolio plans
- **Bank transfers** (customer balance / US bank transfer). Used for hardware purchases and pay-by-invoice subscriptions

The code requests exactly these through `allowed_payment_method_types` (cards + ACH on Checkout; cards + ACH + bank transfer for hardware). It also sends `payment_settings.payment_method_types` on invoices.

## 3. Customer Portal (Dashboard → Settings → Billing → Customer portal)

Turn on:
- Update payment methods, view and download invoices (owners see their own invoices; the PRD requires that invoices aren't admin-only)
- Cancel subscriptions, **at end of billing period**
- Switch plans: allow Pro monthly ⇄ Pro annual ⇄ Portfolio, using the prices above

## 4. Webhook endpoint (Dashboard → Developers → Webhooks)

- URL: `https://<your-host>/billing/webhook`
- Events:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded` (ACH and bank transfer confirm later)
  - `checkout.session.async_payment_failed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- Copy the **signing secret** into `STRIPE_WEBHOOK_SECRET`

Each event is applied once (stored in `stripe_events`), and the handler returns 5xx on internal errors so Stripe retries.

## 5. Environment variables

```
STRIPE_SECRET_KEY=sk_test_...        # sk_live_... in production
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
STRIPE_PRICE_PORTFOLIO_MONTHLY=price_...
STRIPE_PRICE_BUNDLE_DESK=price_...
STRIPE_PRICE_BUNDLE_WALL=price_...
STRIPE_PRICE_KIT_DESK=price_...
STRIPE_PRICE_KIT_WALL=price_...
APP_BASE_URL=https://<your-host>     # used for Checkout success/cancel and portal return URLs
```

Keep keys in the server's environment (Plesk → Node.js → environment variables), never in the repo or chat.

## Sandbox status (2026-10-04)

- The sandbox is **Wingu Digital (test mode)**: 7 StayGuide prices created with `npm run stripe:setup`; the keys are in the local git-ignored `.env`
- Verified end to end with the real Stripe sandbox and `stripe listen`:
  - Checkout with the 4242 card → webhook → Pro · Active
  - pairing unlocked
  - second property → quantity 2
  - cancel → Free
  - Checkout offers Card + US bank account (ACH)
- **Stripe CLI on Intel Macs:** Homebrew needs current Xcode Command Line Tools to build it. Instead, install the official binary from GitHub (`gh release download --repo stripe/stripe-cli --pattern 'stripe_*_mac-os_x86_64.tar.gz'`), check it against `stripe-mac-checksums.txt`, and copy it to `/usr/local/bin`
- For local webhooks, `stripe listen --api-key <test key> --print-secret` gives the `STRIPE_WEBHOOK_SECRET`, so `stripe login` isn't required
- The sandbox has a few test customers and cancelled subscriptions from this verification ("Sandbox Villas", "Sandbox Check"). They're harmless; delete them in the dashboard if you like

## 6. Test before going live

1. `stripe listen --forward-to localhost:3000/billing/webhook`, then use the printed `whsec_...` as `STRIPE_WEBHOOK_SECRET`
2. Sign up at `/signup`, then go to Billing and choose Pro. Pay with card `4242 4242 4242 4242`, or use test bank account details for ACH
3. Confirm the billing page shows **Pro · Active** and the property's **Tablets → Pair new tablet** works
4. Add a second property and confirm the subscription quantity is 2 in Stripe (prorated invoice item)
5. Use **Manage billing** to cancel. At period end (or with `stripe trigger customer.subscription.deleted`) the account drops to Free and paired tablets show "needs an active subscription"
6. Buy a Desk kit and confirm the order shows in Admin → hardware orders (`GET /admin/hardware-orders`)

Automated coverage: `tests/e2e/billing-test.js` runs the whole flow against a local fake Stripe API (62 checks).

## How plans map to features

| | Free | Pro | Portfolio |
|---|---|---|---|
| Properties | 1 | billed per property | billed per 5-property block |
| Phone/web guide link | ✓ | ✓ | ✓ |
| Tablet kiosk (pairing, device content) | – | ✓ | ✓ |
| Themes / backgrounds | – | ✓ | ✓ |
| Announcements | – | ✓ | ✓ |
| "Powered by StayGuide" | shown | hidden | hidden |

- Companies that existed before self-serve billing are **grandfathered as Pro (legacy)**.
- A subscription that is `past_due` keeps Pro features during Stripe's retry window. `canceled` falls back to Free.
- Removing a property lowers the quantity from the next invoice (no mid-cycle refund). Adding one is prorated.
