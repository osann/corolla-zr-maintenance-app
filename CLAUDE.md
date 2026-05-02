# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Corolla ZR Detailing — Project Context for Claude Code

A personal detailing kit-and-technique guide app being progressively ported from a single HTML file to a full-stack web app with a backend for price scraping, notifications, and multi-device sync.

## What this app is

A personal detailing kit-and-technique guide for a 2025 Toyota Corolla Hatch Hybrid ZR (Australian market). Built around the Bowden's Own product ecosystem with a few non-Bowden additions (303 Aerospace Protectant, Kärcher pressure washer). The app combines:

1. A **kit purchase checklist** organised into four phases (priority-ordered acquisition plan)
2. A **per-product technique guide** with surface compatibility rules
3. **Wash routines** (full exterior, interior, ongoing maintenance schedule)
4. A **wash session log** with a streak counter
5. A **spend tracker** with budget targets and Australian sale-alert guidance
6. A **settings tab** for customising frequencies, routine steps, and display preferences
7. A **references panel** linking out to manufacturer pages, retailers, and detailing community sources

The car is in Australia, so all retailer references are Australian (Supercheap Auto, Repco, Autopro, BCF, Detailing Shed, OzBargain, etc.) and pricing is in AUD.

## Current state

The frontend has been split into three files — no build step yet, no framework, no package.json:

- `index.html` — HTML structure only (~1,744 lines)
- `styles.css` — all CSS (~1,193 lines, extracted from the original inline `<style>` block)
- `app.js` — all JavaScript (~711 lines, extracted from the original inline `<script>` block)

Open `index.html` directly in a browser to run the app. There is no dev server, no compile step, and no `npm install`.

It runs in two environments:
- **Claude.ai artifact runtime** — uses `window.storage` (a key-value persistence API exposed to Claude artifacts)
- **Standalone browser** — falls back to `localStorage`

The storage abstraction is in `storageGet()` / `storageSet()` in `app.js`. When porting to a real web app, replace these with `fetch` calls to the backend but keep the function signatures so the rest of the code doesn't need to change.

## Architecture overview

### Tabs
Five panels, only one visible at a time. Tab buttons toggle `.active` class on both the tab button and the `.panel` div. IDs:
- `checklist` — kit purchase tracker (the original tab)
- `guide` — technique reference (mostly static content)
- `routine` — wash routines and ongoing schedule
- `log` — wash session log
- `spend` — spend tracker with sale alerts
- `refs` — references/links
- `settings` — user preferences and customisation

### Data model

All persisted data is keyed in storage:

| Storage key | Shape | Owner |
|---|---|---|
| `corolla-detailing-app-v4` | `{ "item-0": true, "item-1": false, ... }` | Checklist (which kit items have been bought) |
| `corolla-washlog-v1` | `Array<{id, date, type, steps[], notes}>` | Wash log entries |
| `corolla-budget-v1` | `{ target: number }` | Budget target |
| `corolla-settings-v1` | `{ freq, routines, prefs, car }` | Settings panel state |

The version suffix (`-v1`, `-v4`) is intentional — bump it on breaking shape changes rather than writing migrations. For a real backend, swap this for a proper schema/migration story.

### Kit items

Every `<label class="item">` in the checklist has:
- `data-price` (integer AUD)
- An inner `<div class="item-name">` (the product name)
- An inner `<div class="item-desc">` (one-line description)
- An inner `<div class="item-price">` (display price, often a range like "$60–80")
- Wrapping `.phase` parent has `data-phase` (1–4)

There are roughly 24 items total. The JS reads them via `document.querySelectorAll('.item')` at startup. **Important:** items are identified by index (`item-0`, `item-1`...) not by a stable ID. If you add new items to a phase, append them to the end of that phase's section to avoid renumbering existing items and breaking saved state — or migrate to slugged IDs derived from product name.

### Routine steps

Defined in JS as `DEFAULT_STEPS` covering three lists:
- `exterior` — full wash routine
- `interior` — interior detail routine
- `log` — chips that appear in the log entry form

User customisations override the defaults via the settings panel and are saved in `settings.routines`.

### Frequency settings

`FREQ_OPTIONS` defines the picker values for each frequency setting (full wash, interior detail, Bead Machine, 303 Aerospace, Leather Guard). The selected index is stored in `settings.freq[key]`. `applySchedule()` writes the selected option back into table cells with `data-sched` attributes in the Routines panel.

### CSS conventions

- All design tokens live in `:root` CSS variables (and `prefers-color-scheme: dark` overrides)
- Two fonts: **Fraunces** (display, serif) for headings; **Inter** (body, sans) for everything else
- Colour system: warm cream `#faf8f3` light theme, dark theme is `#15171a`
- Accent colour `--accent` is a forest green (`#2d7d5a`) — chosen to feel "automotive care" without being generic blue
- Border radius scale: `--radius` 10px, `--radius-lg` 16px
- All panels and cards share `.shadow` (subtle two-stop drop shadow)

When adding new components, reuse existing tokens rather than introducing new colours/sizes. The minimalist aesthetic was a deliberate choice — avoid anything Material-Design-y or generic SaaS-looking.

### JavaScript conventions

- Vanilla JS, no framework
- All async operations use `async/await`
- Storage helpers (`storageGet`, `storageSet`) return parsed JSON or `null`
- Render functions are named `render*` (e.g. `renderLog`, `renderSpendPanel`)
- Apply functions are named `apply*` (e.g. `applyPrefs`, `applySchedule`) — these mutate the DOM based on current settings
- `init()` runs on load and chains: `loadChecklist → loadLog → loadBudget → loadSettings`

When porting to a real web app, the obvious next step is to migrate to a small framework (SvelteKit or Astro both fit this single-page, content-heavy use case well). React would be overkill.

## Recommended target architecture for the repo

```
corolla-detailing/
├── frontend/              # Existing HTML, refactored
│   ├── index.html         # Or split into routes if using SvelteKit/Astro
│   ├── styles/
│   ├── scripts/
│   └── components/
├── backend/               # New
│   ├── scraper/           # Price scraping jobs
│   ├── api/               # REST or tRPC endpoints
│   ├── db/                # Schema + migrations
│   └── notifications/     # Email/push alert delivery
├── shared/                # Types shared between frontend and backend
├── .github/workflows/     # Scheduled scraper runs via GitHub Actions
└── docker-compose.yml     # Local dev environment
```

Recommended stack:
- **Backend:** Node.js with TypeScript, Hono or Fastify for the API, Drizzle ORM, SQLite for dev / Postgres for production
- **Scraper:** Playwright (handles JS-rendered pages on Supercheap and Repco)
- **Scheduling:** GitHub Actions cron for free-tier scraping, or a small VPS with node-cron
- **Notifications:** Resend or AWS SES for email, ntfy.sh for free push notifications
- **Hosting:** Frontend on Vercel/Netlify, backend on Fly.io or Railway

The scraper should be a separate process from the API — long-running scraping jobs shouldn't block API requests.

## Feature backlog

Ranked by usefulness × feasibility. Items higher on the list have more user value with less implementation complexity.

### 1. Price tracking + alerts (the original ask)

**Goal:** Know when products in the kit drop in price at Australian retailers.

**Implementation:**
- For each kit item, store one or more product URLs across retailers (Supercheap Auto, Repco, Autopro, Bowden's Own direct)
- Run a daily scraper that fetches current price from each URL
- Store each price observation as a row in a `price_history` table: `(product_id, retailer, price, observed_at, on_sale_flag)`
- Detect "on sale" by either: presence of strike-through pricing in the DOM, or a price drop below a 30-day rolling average by more than 15%
- Expose two API endpoints: `/api/products/:id/prices` (history) and `/api/alerts` (triggered alerts in last 7 days)
- Surface in the spend tab: a sparkline next to each item, a flame icon on items currently below RRP, and a list of recent price drops at the top
- User can set per-item alert thresholds (e.g. "notify me when Nanolicious 5L drops below $55")
- Notification delivery: email digest at most once per day, never spammy

**Site-specific notes:**
- **bowdensown.com.au** — Shopify store, prices in JSON-LD structured data, easy to scrape
- **supercheapauto.com.au** — has an internal search API at `/api/search` that returns JSON; reverse-engineering this is more reliable than HTML scraping
- **repco.com.au** — JS-rendered, needs Playwright; rate-limit aggressively (5 second delay between requests)
- **autopro.com.au** — straightforward HTML, low traffic so be polite

Always set a real User-Agent header identifying the project and rate-limit requests. Cache for 6 hours minimum — these prices don't change minute-to-minute.

### 2. Wash session reminders

**Goal:** Push notification when a wash is due based on the user's frequency settings and the most recent log entry.

**Implementation:**
- Read `settings.freq.fullWash` and the most recent entry in `washLog`
- Calculate next-due date
- Web push notification via the Push API + service worker, OR email via the same notification system as price alerts
- Daily cron checks all users, sends notifications for anything due today or overdue
- Add a "snooze" button that adds 3 days to the next-due date

The current `calcStreak()` function already tracks consecutive weeks — this can be reused to add streak-protection alerts ("don't break your 6-week streak — wash due tomorrow").

### 3. Photo log per session

**Goal:** Attach before/after photos to wash log entries. Useful for spotting paint defects over time and for satisfaction.

**Implementation:**
- Add file upload to the log entry form
- Backend storage: S3-compatible object storage (R2 is cheapest for this)
- Generate thumbnails server-side
- Display in log entry cards as a small grid
- Optional EXIF stripping for privacy

### 4. Multi-device sync

**Goal:** Currently everything is in `localStorage` / `window.storage`. After porting, the backend has the data, so accessing from phone + desktop should just work — but needs auth.

**Implementation:**
- Magic link email auth (no passwords) — simplest UX, see Lucia or Auth.js
- All existing storage keys become user-scoped database rows
- A "migrate from local" button that reads existing `localStorage` and POSTs it to the backend on first sign-in

### 5. Inventory tracking with depletion forecast

**Goal:** Know when you're running out of a product before you run out.

**Implementation:**
- For each kit item, store `volume_ml` and `usage_per_wash_ml` (estimated)
- Each wash log entry that uses a product decrements the running total
- Show a "running low" indicator when below 20% remaining
- Couple this with the price tracker to suggest "Nanolicious is 30% off and you're at 15% remaining — buy now"

The Bowden's Own product pages list typical-uses-per-bottle, which can seed the defaults.

### 6. Weather-aware wash recommendations

**Goal:** Don't recommend a wash when it's about to rain. Recommend extra protection before a hot week.

**Implementation:**
- BOM (Bureau of Meteorology) has a free API — `api.weather.bom.gov.au` — for Australian forecasts
- User's postcode stored in settings
- If rain forecast in next 24h, show "wait until Wednesday" hint on the wash-due card
- If 35°C+ forecast for the week, surface a banner suggesting Bead Machine reapplication if it's due soon

### 7. Product comparison + alternative suggestions

**Goal:** When a Bowden's product is unavailable, suggest the equivalent from another brand. Already partially documented in the references panel ("Detailing Shed stocks P&S, Gyeon, Gtechniq").

**Implementation:**
- Static mapping table: `{ "Bead Machine": ["Gyeon Wet Coat", "P&S Bead Maker"] }`
- Show on each product page in the technique guide
- Could later be enhanced with cross-brand price tracking — "Bead Machine is $50, Gyeon Wet Coat is $35 today"

### 8. Maintenance log beyond detailing

**Goal:** Service records, tyre rotations, tyre pressure checks, registration renewal dates. The car already has a "Quarterly tyre pressure check" line in the maintenance schedule — this can grow.

**Implementation:**
- New "Maintenance" tab alongside the wash log
- Same shape: dated entries, type categorisation, notes
- Recurring reminder support (rego renewal annually, etc.)
- Could integrate with the user's calendar via .ics export

### 9. Export PDF report

**Goal:** Generate a printable kit-and-technique reference PDF for offline / glovebox use.

**Implementation:**
- Server-side PDF generation via Puppeteer or Playwright (render the page, save as PDF)
- A dedicated print stylesheet (the file already has `@media print` rules — extend these)
- Trigger from a button in settings
- Could also generate per-wash session printable receipts

### 10. Community sharing (much later)

**Goal:** Other Australian Corolla owners want this too. Or other car/product combos.

**Implementation:**
- Templating: separate the static product/technique data into JSON (currently it's hardcoded HTML)
- Allow forking — "Use this as a template" → user picks their car model and starting kit
- Shared library of car/product combos
- This is a significant rewrite; only worth it if the app sees real adoption

## Things to preserve when refactoring

These are intentional design choices that should survive a port:

1. **Aesthetic restraint.** The minimalist design with Fraunces serif headings is a deliberate departure from the dashboard-and-gauges look most car apps default to. Don't add charts where prose works. Don't add gauge dials. The audience is one person who likes quiet interfaces.

2. **Australian-specific advice.** Don't generalise the retailer recommendations to "Amazon" or generic suggestions. The whole point is "where in Australia, when, at what discount." If multi-country support is added later, make AU the default and add others as opt-in.

3. **The Bowden's-first ecosystem framing.** The technique guide is structured around the Bowden's product range with non-Bowden additions called out as exceptions (303 Aerospace, Kärcher). Don't reorganise into product-agnostic technique categories — the brand grounding is part of why the guide is opinionated and useful.

4. **The dual-read environment.** The HTML file should still work standalone (loaded from disk, no backend) for the original Claude artifact use case. Storage helpers degrade to localStorage when the API is unavailable. New features should be additive — if the backend is missing, the app still functions as a static guide.

5. **Phase-based kit organisation.** The four phases are an opinionated acquisition plan, not just a category list. Phase 1 is "what you need to wash the car at all," Phase 2 is "complete the exterior + interior," Phase 3 is "go bulk on consumables," Phase 4 is "add long-term protection." This ordering is the genuine recommendation; don't sort alphabetically or by price.

## Files in the repo

- `index.html` — HTML structure, tab panels, all static content
- `styles.css` — all CSS; edit this for any visual changes
- `app.js` — all JavaScript; edit this for any behaviour changes
- `CLAUDE.md` — this document
- `TASKS.md` — feature backlog with per-task checklists

The next milestones in order:

1. **Add tooling** — ESLint, Prettier, TypeScript config, Husky pre-commit hook.
2. **Stand up the backend skeleton** — `/api/health` endpoint, database connection, prove the architecture.
3. **Build the price tracker end-to-end for one retailer** — Bowden's direct is the easiest starting point. Get the full pipeline working (scrape → store → display in spend tab) before scaling out to other retailers.
4. **Iterate** — each TASKS.md item is its own milestone.

Don't try to build everything at once. The HTML file is genuinely useful as it stands; each backend feature should ship independently.

## Conventions for working on this codebase

- **Don't break the standalone HTML file** until the new architecture is genuinely better. `index.html` must continue to work when opened directly from disk during the transition.
- **Real numbers, real retailers, real product names.** No placeholder data, no "Lorem ipsum products." This is a real personal tool.
- **Australian English spelling** in user-facing copy: colour, optimise, behaviour. American spellings in code identifiers are fine.
- **No analytics, no tracking, no third-party scripts** without an explicit opt-in toggle in settings. The original app's privacy posture (everything local, nothing leaves the browser) is part of what makes it pleasant to use.
- **Test scraping ethically.** Respect robots.txt, rate-limit aggressively, identify the project in User-Agent strings. The retailers are not the enemy — we're just consumers wanting to know when something's on sale.

## Open questions to resolve early

- Single-user (just the original owner) or multi-user from day one? Affects auth, schema, hosting cost
- Self-hosted or managed services? (Vercel + Fly.io vs. a VPS)
- Static product catalogue in code or editable through an admin UI?
- How aggressive should price-drop notifications be? (Daily digest vs. real-time)

These don't need answers before starting — but worth thinking about before committing to schema decisions that are hard to undo.
