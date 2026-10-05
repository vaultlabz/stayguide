# Project memory

Short-lived facts agents should remember for this repo. Update as the project evolves.

## Overview

- **Purpose:** StayGuide — multi-tenant SaaS digital welcome book for short-term rentals (guest tablet app + owner admin). See `StayGuide-PRD.md`.
- **Stack:** Node.js + Express + TypeScript, MySQL (mysql2), JWT auth, multer/sharp uploads; server-rendered views in `src/views`. PRD mentions a Flutter Android tablet client.
- **Key paths:** mgr data in `MGR/`; memory here in `.mgr/memory/`; dev history in `docs/todo.md`
- **mgr + Trello board:** not mapped (`MGR/trello.json` disabled)
- **Git remote:** https://github.com/vaultlabz/stayguide (private; see MGR/git.json)

## Decisions

- 2026-10-03 17:53 — Guest client = Node web app in a kiosk shell (Fully Kiosk), not Flutter — one codebase, instant updates; PWA offline + device pairing cover the APK benefits
- 2026-10-03 17:53 — StayGuide supplies managed tablets ($300/tablet/yr); standard device Samsung Galaxy Tab A11+ 8GB (7 yrs updates), Tab S10 FE premium, Tab Active5 Pro rugged
- 2026-10-03 17:53 — Complement Google Vacation Rentals, don't become a PMS/booking engine — tablet drives direct bookings + reviews via QR (/r/* redirects with UTM + sg_click)
- 2026-10-03 17:53 — Target PMSs for future import: Hostaway, Guesty first; then Hospitable, Lodgify, OwnerRez (PmsAdapter interface)
- 2026-10-03 17:53 — Smart-hardware upsells are roadmap only: tablet kit, noise monitors, per-stay Wi-Fi, locks/thermostats via Seam
- 2026-10-03 17:53 — Tablet look: icon-only home, glass UI, 8 gradients from Figma "Luxury Gradients" (file vvZxGSsNrWLCILQJkV3aaY) pre-rendered to public/img/gradients — on `design` branch
- 2026-10-03 17:53 — Repo: private github.com/vaultlabz/stayguide (main + design); jonbeatz (jonbeatz@gmail.com) has org admin access

- 2026-10-05 08:20 — PRD v1.0 (Agent 44) adopted with guest product first: Free $0 (1 property, phone guide) / Pro $9.99 per property per month or $89/yr / Portfolio $32 per 5-property block; hardware Desk/Wall kits $399/$699 or $39/$49 per month bundles; Ops tier (field/maintenance app, G7) priced separately later
- 2026-10-05 08:20 — Hardware: generic RK3568-class Android AIO kits allowed, gated by /tablet/diagnostics + the vetting checklist in docs/KIOSK_SETUP.md
- 2026-10-05 08:20 — Stripe: the sandbox is the Wingu Digital test account (key from ~/Desktop/ctrl/master.txt "stripe (test)", never the live key there); prices via `npm run stripe:setup`; payments = cards + ACH + bank transfer; webhooks idempotent
- 2026-10-05 08:20 — Design partner "Trinity" (Vault Labs) gets updates via docs/TRINITY_DESIGN_UPDATE.md + docs/screenshots/

## Conventions (mgr protocol)

- **Code changes:** preface each change with `// YYYY-MM-DD HH:MM, description`
- **Session logs:** prefix each entry with `YYYY-MM-DD HH:MM`; append only
- **Todo notes:** append only — never overwrite `MGR/todo/notes.txt`
- **Handoff:** overwrite `MGR/sessions/handoff.md` each session end (Claude ↔ Cursor)
- **Worklog:** append to `MGR/sessions/worklog.md` on every task create/start/complete/delete/edit
- **Project rule (CLAUDE.md):** also log every change in `docs/todo.md` using its entry format

## Links

- Docs: `docs/`, `StayGuide-PRD.md`, `DEPLOYMENT_GUIDE.md`, `plesk-deploy.md`
- Related repos:
