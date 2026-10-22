# G7: Ops add-on (field / maintenance) — detailed plan

<!-- 2026-10-07 18:10, draft for discussion; decisions from the user on 2026-10-07 are recorded in MGR/tasks.json #41 -->

**Status:** approved 2026-10-07; stages S1–S9 built 2026-10-07 to 2026-10-08 (see docs/todo.md). Before launch: set OPS_PRICE_MONTHLY + STRIPE_PRICE_OPS_MONTHLY, OPS_SECRET_KEY, VAPID keys, SMTP.

## Goal

Property managers dispatch, follow and verify everyone they hire (in-house techs, cleaners, contractors, outside vendors) from the company dashboard. Workers use a mobile web app (`/maint`) that keeps working on a bad connection.

## Decisions already made (2026-10-07)

| Topic | Decision |
|---|---|
| Price | Ops add-on, per property per month on top of Pro. Amount TBD; lives in `src/config/plans.ts` |
| People | Workers **and** vendors get accounts through a **manager invite** + onboarding profile; then they receive job links and codes |
| Codes | Access codes visible only during the job window · QR at the property for check-in/out · one-time email sign-in codes |
| v1 scope | Everything in the outline (see stages below) |
| Offline | Read offline + queued updates |
| Notifications | Email + web push (no SMS) |
| Assign / approve | **Only the property manager** (company admins) creates, assigns, approves and verifies work. No dispatcher or lead-tech role in v1 |
| Guest details | **Hidden** from workers: no guest name, phone or room on a job; only the report's title, description, location and photos |
| Cost approval | **Yes**: a job whose estimate exceeds the company's threshold waits for manager approval before work starts |
| Pay export | CSV is enough for now |
| Branding | Worker app shows the **managing company's name and logo**, with a small "Powered by StayGuide" |

## What the current code forces (design constraints)

1. **`users.email` is globally unique and a user has one `company_id`.** A vendor who works for two StayGuide customers cannot be one account today. → Workers get a separate membership table (`company_workers`) so one account can belong to several companies, each company seeing only its own jobs.
2. **`public/uploads` is served publicly.** Job photos show the inside of homes and sometimes guests' belongings. → Job photos go to a private folder (`storage/ops/`, outside `public/`) and are served only through an authenticated route.
3. **Lockbox/door codes are free text** inside `check_in_instructions`. → A structured `access_code` field per property (and an optional per-job override), stored encrypted at rest, revealed by the API only inside the job window.
4. **Single Node process on Plesk.** → Preventive schedules and "overdue" alerts run from an in-process timer (like the in-memory rate limiter). Fine for one instance; noted as a limit if we ever scale out.
5. **`users.role`** is `super_admin | company_admin`. → Add `field_worker` (one role; tech/cleaner/contractor/vendor is a `worker_type` on the membership).

## Data model (new tables; one migration `2026-10-xx_ops.sql` + `schema.sql`)

- **`company_workers`**: `company_id`, `user_id`, `worker_type` (`tech` | `cleaner` | `contractor` | `vendor`), `status` (`invited` | `active` | `suspended`), `skills` (JSON tags), `hourly_rate` (for pay export), `invited_by`, timestamps. Unique (`company_id`, `user_id`).
- **`worker_invites`**: `company_id`, `email`, `phone`, `name`, `worker_type`, `token_hash`, `expires_at` (7 days), `accepted_at`.
- **`vendor_profiles`** (per user): `business_name`, `license_no`, `insurance_provider`, `coi_file` (private), `coi_expires_on`.
- **`login_codes`**: `user_id`, `code_hash`, `expires_at` (10 min), `attempts`, `used_at`. Email one-time codes.
- **`work_orders`**: `company_id`, `property_id`, `amenity_id?`, `guest_report_id?`, `type` (`maintenance` | `cleaning` | `inspection` | `ad_hoc`), `title`, `description`, `priority`, `status`, `assignee_user_id?`, `window_start`, `window_end`, `due_at`, `cost_estimate`, `cost_actual`, `checklist_template_id?`, `schedule_id?`, `access_code_override_enc?`, timestamps.
- **`work_order_events`** (audit trail, append-only): `work_order_id`, `actor_user_id`, `action` (`created` `assigned` `started` `checked_in` `checked_out` `submitted` `verified` `bounced` `canceled` `commented`), `note`, `data` (JSON), `created_at`, `client_created_at` (for queued offline updates).
- **`work_order_photos`**: `work_order_id`, `checklist_item_id?`, `kind` (`before` | `after` | `step` | `receipt`), `path` (private), `taken_at`, `uploaded_by`.
- **`checklist_templates`** / **`checklist_template_items`**: name, type, items with `label`, `requires_photo`, `order`.
- **`work_order_checklist`**: per-job copy of the items with `done`, `done_at`, `photo_id`.
- **`time_entries`**: `work_order_id`, `user_id`, `clock_in`, `clock_out`, `method` (`qr` | `button`), `lat/lng?` (optional, only if the worker allows location).
- **`maintenance_schedules`**: `property_id`, `amenity_id?`, `title`, `type`, `checklist_template_id?`, `recurrence` (`every_n_days` | `monthly_day` | `after_checkout`* ), `next_run_at`, `default_assignee?`, `active`. *`after_checkout` needs PMS sync → out of scope, field kept for later.
- **`property_qr_tokens`**: `property_id`, `token_hash`, `created_at`, `revoked_at` (rotatable sticker).
- **`push_subscriptions`**: `user_id`, `endpoint`, `keys`, `user_agent`, `created_at`.
- **`properties`** gains `access_code_enc` and `access_notes`.
- **`companies`** gains `ops_approval_threshold` (DECIMAL, NULL = never require approval).
- **`work_orders`** also gets `approved_amount`, `approved_by`, `approved_at` (status enum includes `awaiting_approval`).

Mock mode gets matching arrays in `src/utils/mock-database.ts`, as every other service does.

## Work-order lifecycle

```
new ──assign──▶ assigned ──(estimate > threshold)──▶ awaiting_approval ──approve──▶ assigned
                                                                       └─reject (reason)─▶ canceled / back to new
assigned ──start / QR check-in──▶ in_progress ──submit (photos + checklist + notes, check-out)──▶ done
  ▲                │                                                                                          │
  └──── unassign ──┘                                     manager: verify ──▶ verified        bounce (reason) ──┘──▶ in_progress
any state ──cancel──▶ canceled
```

- Every transition writes a `work_order_events` row (actor + timestamp). Rules live in one place (`WorkOrderService.transition()`), so the API, the queue replay and the UI can't disagree.
- Submit is blocked until every `requires_photo` checklist item has a photo.
- **Cost approval:** `companies.ops_approval_threshold` (USD, default $250, editable in Ops settings; empty = no approval). A worker enters an estimate (with an optional quote photo/PDF); if it is over the threshold the job moves to `awaiting_approval`, *Start*/QR check-in are blocked, and the manager gets email + push to approve or reject with a reason. A manager can also pre-approve an amount when assigning. If the actual cost at submit exceeds the approved amount by more than 10 %, the job is flagged in the review queue.
- **Only company admins** can create, assign, approve, verify, bounce or cancel. Workers can only start, check in/out, update checklist/photos/notes/costs and submit their own jobs.
- Verifying an amenity work order calls the existing `autoCloseAmenityReports` so linked guest reports close; a work order created from a guest report sets that report to `in_progress`.
- Urgent guest reports (priority urgent / urgency immediate) **auto-create** an unassigned work order and alert the manager.

## Codes

- **Access code:** `GET /maint/jobs/:id` returns the property code only when the job is assigned to the caller, is `assigned`/`in_progress`, and `now` is within `window_start − 30 min … window_end + 30 min`. Otherwise the field is absent. Every reveal is logged as an event. Encrypted with AES-256-GCM using `OPS_SECRET_KEY` from env.
- **QR check-in:** each property has a printed QR (`/maint/scan/:token`). Scanning while signed in: if the worker has an active job there now → clock in (or out if already in) and write the event; otherwise "no job here right now". Managers can rotate the QR from the property page (old sticker stops working) and print a new one.
- **Sign-in codes:** `/maint/login` asks for email → 6-digit code by email (10 min, 5 tries, rate limited like `/device/pair`). Password sign-in also works for people who set one during onboarding.

## Onboarding

1. Manager → **Team** page → *Invite worker*: name, email, optional phone, type, skills.
2. Invite email with a link (7 days). The worker sets a name/password (or chooses code-only sign-in), adds skills; vendors add business name, license, insurance + COI upload and expiry.
3. On first sign-in the app asks to **install to the home screen** and **allow notifications** (iPhone only delivers web push to installed apps; email remains the fallback).
4. Existing account (same email, other company) → the invite simply adds a membership.

## Worker app (`/maint`, PWA)

- **Today / Upcoming / Done** job lists (only jobs assigned to them, only for companies where they're active).
- Job detail: property name/address with a maps link, window, priority, description, checklist, photos, the access code (only inside the window), manager notes. If the job came from a guest report: its title, description, location and photos only. **Guest name, phone and room are never sent to the worker app** (the API strips them; there is no setting to turn them on in v1).
- **Branding:** header shows the managing company's `logo_url` and name (for a worker in several companies, each job shows its own company), and the footer reads "Powered by StayGuide". Invite and notification emails use the company name as the sender name (e.g. "Demo Rentals via StayGuide").
- Actions: *Start* / *Scan QR*, take before/after photos (camera input, resized client-side then `sharp` on the server), tick checklist items, add notes and receipts with cost, *Submit*.
- **Offline:** service worker `/maint-sw.js` (separate from the tablet's `sw.js`) caches the shell and the job list/detail JSON. Actions and photos go into an IndexedDB outbox with a client id + `client_created_at`; replayed in order when online (Background Sync where supported, otherwise on reconnect/app open). The server accepts replays idempotently (client id) and records both times. The access code is **never** cached offline.
- Push: `web-push` with VAPID keys (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`); events: new assignment, job bounced, schedule reminder.

## Manager side (company dashboard)

- **Ops board:** columns by status, filters by property / person / type / date; overdue (past `due_at`) and unassigned badges. Polls every 30 s (no websockets in v1).
- Create / edit / assign / reassign / cancel; **Verify** or **Bounce with reason** from a review queue that shows photos and checklist side by side.
- Convert a guest report → work order (button on the Guest reports card).
- **Team:** invites, members, suspend, skills, hourly rate; vendor directory with COI expiry (warn 30 days ahead, block assignment when expired).
- **Checklists:** template editor (items, photo-required flag, order).
- **Schedules:** per property/amenity recurring jobs; timer creates the work orders `lead_days` ahead.
- **Time & pay:** time entries per person and period, edits with a reason (audited), CSV export (person, job, property, in, out, hours, rate, amount).
- **Alerts:** email + push to company admins for urgent reports, overdue jobs, COI expiring.
- Super admin: Ops shown on the admin dashboard (adoption, revenue line).

## Billing / gating

- `plans.ts`: `OPS_ADDON = { price: { month: <TBD> }, unit: 'property' }` + `PRICE_ENV.ops_month = 'STRIPE_PRICE_OPS_MONTHLY'`.
- Stripe: second subscription item on the Pro/Portfolio subscription, quantity = active properties (kept in sync where Pro quantity is synced today).
- `EntitlementService`: `features.ops`. Ops routes return the existing `402 upgrade_required` shape; workers of a company that drops Ops see "this company's jobs are paused" and lose access to codes.
- Billing page: Ops card (add / remove).

## Security & privacy

- Workers see only their own assigned jobs; every `/maint` route checks membership + assignment server-side (same pattern as `resolveOwnedProperty`).
- Access codes: encrypted at rest, time-boxed, never cached, every reveal audited.
- Photos and COI files private; served via signed, short-lived URLs or an authenticated route.
- Location on check-in is opt-in and only stored with the time entry.
- Invite / login-code / QR tokens stored as hashes; all of them rate limited.

## Build stages (one release; each stage ends with tests + a demo)

| # | Stage | Ships |
|---|---|---|
| S1 | **Foundations** | migration + mock data, `field_worker` role, memberships, invites + onboarding, email sign-in codes, `/maint` shell + login, Ops entitlement + plans.ts setting |
| S2 | **Work orders core** | WorkOrderService + lifecycle + audit, manager board (create/assign/verify/bounce), cost approval threshold + approval queue, worker job list/detail with company branding, guest report → work order (guest details stripped), urgent auto-create |
| S3 | **On site** | encrypted access codes + time window, property QR (print/rotate) + check-in/out, private photo pipeline, notes/costs |
| S4 | **Checklists** | templates, per-job checklist, photo-required items, review queue |
| S5 | **Offline + push** | `/maint-sw.js`, IndexedDB outbox + idempotent replay, VAPID web push, install prompt |
| S6 | **Team & vendors** | vendor profiles, COI upload/expiry alerts, skills, hourly rates |
| S7 | **Time & pay** | time entries view/edit with audit, CSV pay export |
| S8 | **Preventive schedules + alerts** | schedules + timer, overdue/unassigned alerts, admin metrics |
| S9 | **Billing** | Stripe Ops item, billing page card, gating end-to-end |

Each stage: `docs/todo.md` entry, e2e suite (`tests/e2e/ops-s<N>-test.js`) added to `npm run test:e2e`, mgr task + log.

## Tests (highlights)

- Ownership: a worker can't read another company's or another worker's job; access code absent outside the window; QR from property A can't check in to property B.
- Privacy: no guest name/phone/room in any `/maint` response.
- Approval: an estimate over the threshold blocks start/check-in until approved; workers get 403 on assign/approve/verify.
- Lifecycle: illegal transitions rejected; submit blocked without required photos; verify closes linked guest reports.
- Offline: queue three actions + a photo offline (Playwright `context.setOffline`), reconnect, server state and event order correct, no duplicates on double replay.
- Billing: Ops routes 402 without the add-on; quantity follows active properties.
- Mobile layout at 390×844, both themes, no JS errors.

## New dependencies

Only `web-push` (push). Printable property QR codes reuse the `qrcode` package already installed; encryption uses Node's built-in `crypto`.

## Out of scope (later)

PMS / iCal sync and turnover-triggered cleaning, SMS, payroll integrations, GPS geofencing, multi-language worker app, native apps, owner portal.

## Open questions for the user

None. All answered on 2026-10-07 (see the decisions table). The plan needs the user's approval before S1 starts.
