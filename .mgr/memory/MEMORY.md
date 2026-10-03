# Project memory

Short-lived facts agents should remember for this repo. Update as the project evolves.

## Overview

- **Purpose:** StayGuide — multi-tenant SaaS digital welcome book for short-term rentals (guest tablet app + owner admin). See `StayGuide-PRD.md`.
- **Stack:** Node.js + Express + TypeScript, MySQL (mysql2), JWT auth, multer/sharp uploads; server-rendered views in `src/views`. PRD mentions a Flutter Android tablet client.
- **Key paths:** mgr data in `MGR/`; memory here in `.mgr/memory/`; dev history in `docs/todo.md`
- **mgr + Trello board:** not mapped (`MGR/trello.json` disabled)
- **Git remote:** none (not a git repo yet)

## Decisions

- YYYY-MM-DD HH:MM — decision — rationale

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
