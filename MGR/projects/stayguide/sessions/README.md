# Session logs

| File | Rule | Used by |
|------|------|---------|
| `handoff.md` | **Overwrite** on each session end | Claude Code + Cursor — read **first** on resume |
| `latest.md` | **Append only** | Session narrative (on `/stop`) |
| `worklog.md` | **Append only** | **Per task event** (created, started, completed, deleted) |
| `worklog.jsonl` | **Append only** | Machine-readable task events (same events as `worklog.md`) |
| `code-changes.md` | **Append only** | Code-change chart — every change (`ts | tool | desc`); stamped via `scripts/mgr-obsidian-sync.mjs` |
| `code-changes.jsonl` | **Append only** | Machine-readable code-change chart |
| `YYYY-MM-DD*.md` | **Append only** | Optional dated archives |

Prefix log entries with `YYYY-MM-DD HH:MM`. Never delete `latest.md`, `worklog.md`, or dated logs.
