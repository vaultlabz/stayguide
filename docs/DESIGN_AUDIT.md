# StayGuide UI Design Audit

Date: 2026-10-03. Scope: every screen in `src/views/` and the tablet stylesheet. Findings describe the state **before** the redesign; the Resolution column says what the redesign did. Law names refer to the design canon (Von Restorff, Hick, Fitts, Gestalt, WCAG 2.2 AA).

## Cross-cutting findings

| # | Finding | Principle | Severity | Resolution |
|---|---------|-----------|----------|------------|
| 1 | **No shared stylesheet.** Each of 9 pages carried 150-500 lines of inline CSS with about 60 distinct hard-coded hex values (a Tailwind-gray palette plus indigo/purple). Same components (`.btn`, `.stat-card`, `.header`) re-declared per page and already drifting (hover colors, radii 4/5/6/8/10/12/15/20px). | Token, not magic number | High | `public/css/theme.css` tokens; pages consume `var(--*)`; shared app-shell and auth layers |
| 2 | **No dark mode, no theme switch.** Every color is literal; white cards on gray. | Dark-mode readiness | High | Light/dark/auto via `data-theme` + `prefers-color-scheme`, toggle on every non-tablet page |
| 3 | **Purple-to-blue gradients** (`#667eea -> #764ba2`, `#4f46e5 -> #7c3aed`) on landing, login, headers, tablet body, report card, modal headers. Generic, saturated, competes with content. | Anti-slop / single anchor | High | Warm-stone neutrals + one teal accent; no gradients |
| 4 | **System sans only, no scale.** Hierarchy relies on size alone; fixed rem sizes, no fluid scale. | Typographic hierarchy | Medium | Modular scale tokens; serif display stack for page and property titles (system fonts only, CSP forbids external fonts) |
| 5 | **Contrast.** White text on amber (`#f59e0b`) report card and offline banner (about 2:1), `#9ca3af` placeholder/disabled text (2.5:1), `#10b981` text on white (2.5:1), white on `#10b981` buttons (2.5:1). | WCAG 1.4.3 | High | All text tokens chosen for AA; automated scan of rendered text in both themes passes |
| 6 | **Focus states removed** (`outline: none`) on inputs with only a faint 10%-alpha ring; no focus style on buttons/links. | WCAG 2.4.7 | High | Global `:focus-visible` 3px accent outline; inputs keep a ring plus border change |
| 7 | **Touch targets.** Dashboard `.btn-small` about 24px tall; tablet `.close` was a 2rem span (not focusable, no label); tablet inputs about 44px. | Fitts, WCAG 2.5.8 | Medium | Tablet controls measured 48-52px; close is a labelled button; dashboard buttons 34-40px (pointer UI) |
| 8 | **Motion.** `transition: all 0.3s`, card lift `translateY(-5px)` on hover (meaningless on touch/kiosk), no `prefers-reduced-motion`. | Motion canon | Medium | 150ms color/background transitions; reduced-motion kill switch; hover lift removed |
| 9 | **Emoji as UI chrome** (card icons, buttons) renders differently per OS/WebView; a "Test JS" debug button was visible in the production company dashboard. | Occam / decoration | Medium | Tablet card icons are line SVG; debug button removed from the UI; content emoji (manager-chosen amenity icons) kept |
| 10 | **Inline hover handlers and style attributes** for nav (`onmouseover="...rgba(255,255,255,0.2)"`), amenity rows, header text. Unthemable. | Token, not magic number | Medium | Replaced by classes; nav uses `.nav-links` |
| 11 | **Empty/loading/error states are bare text**; tablet error banner was saturated red with white text. | Nielsen #1, #9 | Medium | Loading is a contained pill; errors use tinted danger tokens with a border |

## Per-screen findings

**landing.html** - Full-bleed purple gradient, centered hero, six identical translucent emoji cards (everything pops, nothing leads). Feature headings amber on glass at about 2:1. CTA row mixes three button styles incl. an inline-styled green "Demo". No product visual. *Resolution:* editorial two-column hero with a CSS tablet mock (the one thing to remember: the kiosk in the room), numbered hairline feature list, one primary CTA.

**admin-login / company-login** - Gradient page, white card, faint focus ring, weak error/success blocks, disabled button text 2.3:1, no theme control. *Resolution:* `.sg-auth` layer with tokens, 46-48px controls, serif wordmark, floating theme toggle.

**admin-dashboard / company-dashboard** - Saturated gradient header with white translucent nav; centered stat cards with accent-colored numbers (decorative color on data); modal and slide panel at 60% width (unusable below about 1000px). Company dashboard is 1600 lines: the property panel stacks 8 sections in one scroll (Hick), with Tablets and Direct Booking far below the fold. `previewMainImage` injected the raw URL into `innerHTML` (self-XSS). *Resolution:* sticky surface header with active-state nav, left-aligned stat cards with uppercase micro-labels, panel width `min(760px, 100%)`, new "Tablet Appearance" section, previews escape the URL. *Not changed:* panel information architecture.

**admin-billing / company-billing / invoice-detail** - Same header/button drift; stat-card variants distinguished only by border color; tables not responsive; invoice header a full gradient block; inline-styled action buttons. *Resolution:* shared shell.

**billing-widget.html** - Fragment loaded into the admin dashboard with hard-coded grays. *Resolution:* tokenized, inherits the page theme.

**tablet-app.html + tablet-app.css** - Purple gradient body; frosted `backdrop-filter` on every card (GPU-heavy on a Tab A11+); centered header; Wi-Fi (what guests need first) in a 0.9rem monospace light-blue box; `minmax(300px)` grid gave cramped columns; QR cards above all information pushed Wi-Fi and house info below the fold at 1280x800; amber report card with white text (about 2:1); blue gradient modal header; `.close` unreachable by keyboard; inline-styled amenity rows; 16px base (small at 1 m). Pairing screen was a plain card with a purple button. *Resolution:* 18px base, 2-column layout at 1280, Wi-Fi values 1.44rem mono under uppercase labels, QR cards moved below info cards (two-up), solid cards (translucent + blur only when a background image is set), 48-56px targets, QR boxes always dark-on-white with a 12px quiet zone, per-property theme and background image with a scrim.

## Responsive notes
Dashboards collapse at 768px (one column) but the header wrapped awkwardly and the slide panel stayed 60% wide; fixed. Tablet is landscape-first; portrait and phone stack to one column (verified by CSS only, not on a device).

## Follow-ups left open
1. Billing/admin tables need an overflow wrapper on narrow screens.
2. Company dashboard "Monthly Cost" shows `$NaN` in mock mode (data bug, unrelated to styling).
3. Property panel is a single long scroll; tabs would reduce choice load.
4. Variant stat cards keep a colored left border that curves with the card radius (slight artifact).
5. The pairing screen (before any content loads) cannot know the manager's theme, so it follows the OS; the look is cached after the first successful load.
