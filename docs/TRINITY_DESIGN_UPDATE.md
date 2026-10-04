# Design update for Trinity: new screens since the redesign

<!-- 2026-10-04 01:10, handoff for the Vault Labs / Trinity design pass. Screenshots: docs/screenshots/new-screens/ -->

**Date:** 2026-10-04 · **Branch:** `main` (the `design` branch is already merged, PR #1)
**Baseline:** the redesign you reviewed. Theme system in `public/css/theme.css`; tablet look in `public/css/tablet-app.css`; 8 Figma "Luxury Gradients" backgrounds in `public/img/gradients/`.

Everything below was built after the redesign, for the self-serve launch (PRD v1.0: Free / Pro $9.99 / Portfolio $32). All of it uses the existing tokens and themes, so it's functional and consistent, but **none of it has had a dedicated design pass yet**. Priorities for you are at the end.

---

## New screens

| # | Screen | Route | Screenshot(s) | What it does |
|---|---|---|---|---|
| 1 | **Signup** | `/signup` (`?plan=pro\|portfolio`) | `signup-light.png`, `signup-dark.png` | Self-serve account (Free). With `?plan=`, continues to Billing to choose that plan |
| 2 | **Plan & billing** | `/company/:slug/billing` | `billing-free.png`, `billing-pro-active.png` | Current plan/status, Free/Pro/Portfolio cards with monthly ⇄ annual, "Pay by invoice", hardware kits (Desk/Wall buy or bundle, Signature quote), hardware orders, "Manage billing" (Stripe portal) |
| 3 | **Stripe Checkout** (Stripe-hosted) | from Billing | `stripe-checkout-sandbox.png` | Card + US bank account (ACH). Shows **"Wingu Digital"** branding (sandbox account). Branding is set in Stripe, not in our code |
| 4 | **Pricing section** on the landing page | `/#pricing` | `landing-pricing-light.png`, `-dark.png`, `-phone.png` | Server-rendered from `src/config/plans.ts`: plan cards, annual toggle, tablet kits, fine print, FAQ |
| 5 | **Dashboard → Guide content** | property panel (edit) | `dashboard-guide-content.png` | Tabs: Welcome · Announcements · Restaurants · Local info · How-to videos. Add/edit/hide/delete/reorder; announcements show live/scheduled/ended |
| 6 | **Dashboard → Guest link (phone guide)** | property panel (edit) | `dashboard-guest-link.png` | Link + Copy/Open, printable QR, "Show Wi-Fi password" toggle, Rotate link |
| 7 | **Dashboard → Guest activity** (Pro) | property panel (edit) | `dashboard-guest-activity.png` | Visits (tablet/phone), 30-day trend line, "What guests did" table. Free shows an upgrade note |
| 8 | **Phone guide** (Free tier) | `/g/:token` | `phone-guide-home.png`, `phone-guide-wifi.png`, `phone-guide-book-again.png` | The tablet guide in a phone layout: tap buttons instead of QR codes, "Copy password", "Powered by StayGuide" footer on Free |
| 9 | **Phone guide: dead link** | `/g/<invalid>` | `phone-guide-dead-link.png` | Message when a link was rotated or never existed |
| 10 | **Tablet: subscription required** | `/tablet` (402) | `tablet-subscription-required.png` | Shown when the company's plan lapsed; keeps the pairing and retries every 5 min |
| 11 | **Tablet: Local Guide sheet with real content** | `/tablet` | `tablet-local-guide-sheet.png` | Restaurants + local attractions managed from #5 |
| 12 | **Tablet diagnostics** (internal tool) | `/tablet/diagnostics` | `tablet-diagnostics.png` | On-device check of candidate tablets / generic Android AIOs; pass/warn/fail + "Copy report" |

Also changed, without its own screen:
- **Dashboard stat cards:** "Monthly Cost" now shows the real plan cost (was `$NaN`); "Guest visits (30 days)" replaces the "Tablet Views" placeholder.
- **Upgrade prompts:** any Pro-only action on Free returns 402, and the dashboard shows a `confirm()` dialog offering Plan & billing.
- **Landing hero / nav / CTA:** "Start free" → `/signup`, "See pricing", nav = Pricing · Sign in · Start free; admin login moved to the footer.

---

## Where design is needed (priority order)

1. **Tablet & phone error/empty states** (#9, #10, plus "No internet connection", the pairing screen and a "Guide not available" state). Today they're a plain text bar on black or white. They need designed states with an icon and clear next step, in the glass language and the property's background.
2. **Company sign-in.** "Sign in" still uses a browser `prompt()` asking for the company identifier. A real sign-in screen is needed (email → find company → password). This needs a small backend change too; tell us the flow you want.
3. **Property panel information architecture.** The edit panel is now one long scroll: Basic info, Image, Tablet appearance, Wi-Fi, Instructions, Direct booking & reviews, Guest activity, Guest link, Guide content, Tablets, Amenities. We suggest tabs or a left sub-nav (e.g. *Details · Guest experience · Look · Devices · Activity*).
4. **Upgrade prompt.** Replace the `confirm()` dialog with a designed modal or inline upsell explaining what Pro unlocks.
5. **Billing page polish** (#2): plan cards, kits, orders table; the "past due" and "cancelled" states.
6. **Stripe Checkout branding** (#3): logo, colors and business name for StayGuide in the Stripe account settings (the sandbox currently says Wingu Digital).
7. **Pricing section** (#4): it's on-brand, but a candidate for photography or a device mock and comparison detail.
8. **Diagnostics page** (#12): internal tool, low priority.

---

## Constraints (please keep)

- **CSP:** no external fonts, CDNs or third-party scripts. System font stack or self-hosted files under `public/`. Inline styles and scripts are allowed.
- **Tokens:** use the CSS custom properties in `public/css/theme.css` for both light and dark, and `tablet-app.css` variables (`--t-*`) on the tablet.
- **Tablet:** landscape-first at 1280×800 CSS px (Galaxy Tab A11+, 1920×1200). Touch targets ≥ 48px (tiles ≥ 120px). QR codes stay **black on white with a quiet zone** in every theme. Respect `prefers-reduced-motion`.
- **Phone guide:** 390px wide must not scroll horizontally. A phone can't scan its own screen, so use tap actions, not QR codes.
- **Accessibility:** WCAG AA contrast in both themes and on all 10 tablet backgrounds; visible focus states.
- **IDs and classes used by automated tests:** the full list is in the original design brief. If you rename any, tell us so we update `tests/e2e/*` (around 590 checks guard these screens).

## How to see it live

```
npm install
MOCK_DATABASE=true PORT=3000 npx ts-node src/index.ts
```

- Company dashboard: `/company/demo-rentals/login` with `admin@demorentals.com` / `demo123`
- Billing (Free account): sign up at `/signup`
- Tablet: dashboard → Edit property → Tablets → Pair new tablet, then enter the code at `/tablet`
- Phone guide: dashboard → Edit property → Guest link → Open
- Diagnostics: `/tablet/diagnostics`
