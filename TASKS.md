# Tasks

Backlog items ranked by usefulness × feasibility. Work top-to-bottom — each item is independently shippable.

---

## 1. Price tracking + alerts + notifications ✅

Know when products drop in price at Australian retailers.

- ✅ Add retailer URLs to each kit item (Supercheap Auto, Repco, Auto Barn, Autopro)
- ✅ Build scraper for Supercheap Auto (Playwright, SFCC selectors)
- ✅ Build scraper for Repco (Playwright, Hybris `og:price:amount` meta)
- ✅ Build scraper for Auto Barn (plain fetch, same-platform as Autopro)
- ✅ Build scraper for Autopro (plain fetch, shares SKUs with Auto Barn)
- ✅ Store price observations: `price_history(product_id, retailer, price_cents, observed_at, on_sale)`
- ✅ Detect "on sale": compare-at price in DOM, or >15% drop below 30-day rolling average
- ✅ API endpoints: `GET /api/products`, `GET /api/products/:id/prices`, `GET /api/alerts`
- ✅ Spend tab UI: sparkline per item, flame icon for on-sale items, sale badge in price list
- ✅ Per-item alert thresholds (e.g. "notify me when Nanolicious 5L drops below $55")
- ✅ Email digest notifications — at most once per day

**Notes:**
- Bowden's Own cannot be scraped from any cloud environment — Cloudflare JS challenge on GitHub Actions, hard 403 on Render. All Bowden's products have Repco/Supercheap fallback URLs.
- Scrapers respect robots.txt: Auto Barn and Autopro run via Render cron at 05:00 UTC only (04:00–08:45 UTC crawl window); Supercheap and Repco run via GitHub Actions daily.

---

## 2. Routines overhaul ✅

Fully customisable routine objects replacing static HTML tables.

- ✅ New data model (`corolla-routines-v1`): name, subtext, types (exterior/interior/maintenance), product+action steps, severity-based alerts
- ✅ Routines tab split into "Routines" (read-only view) and "Configure" (editor) sub-tabs
- ✅ `PRODUCT_ACTIONS` map: 34 catalog slug → default action strings; auto-fills action when product matches catalog
- ✅ Drag-to-reorder routine cards in Configure sub-tab
- ✅ CSV export and import (append mode, fresh IDs); UTF-8 BOM for Excel compatibility
- ✅ Claude prompt template (downloadable from Configure tab) for generating routines via AI
- ✅ Wash frequency and routine step chip config moved from Settings into Configure sub-tab
- ✅ Wash frequency decoupled from Maintenance routine display (`applySchedule()` retained for future Schedule page)

---

## 3. Wash session reminders ✅

Per-routine reminder cards in the wash log, backed by a custom interval scheduler and schedule-aware backend cron.

- ✅ `settings.schedules` array: per-routine intervals (`{ routineId, intervalValue, intervalUnit }`) stored in `corolla-settings-v1`
- ✅ Schedules sub-tab in the Routines tab (between Routines and Configure) — select routine + set interval (days/weeks/months/years)
- ✅ Reminder cards at the top of the log tab — one per scheduled routine, always showing next due date or overdue status; overdue cards use accent border
- ✅ Rain forecast replaces displayed due date when rain is forecast within 2 days of due (best wash day shown)
- ✅ "View routine" button on each card — switches to Routines tab and scrolls to the correct routine
- ✅ "Send to TickTick" button per card — `POST /api/notify/wash-reminder` (session-protected); shown only when TickTick is configured
- ✅ Log tab split into History (default) and New Session sub-tabs; adding a session auto-switches to History
- ✅ Backend cron (07:00 UTC) updated to schedule-aware path: iterates `settings.schedules`, type-maps routine types to log entry types, sends per-routine notification when overdue; falls back to legacy 14-day interval if no schedules configured

---

## 4. Photo log per session

Attach before/after photos to wash log entries.

- ☐ Add file upload input to the log entry form
- ☐ Backend: store photos in S3-compatible object storage (Cloudflare R2)
- ☐ Generate thumbnails server-side
- ☐ Display thumbnails in log entry cards as a small grid
- ☐ Strip EXIF data server-side for privacy

---

## 5. Multi-device sync ✅

Access data from phone + desktop after moving storage to the backend.

- ✅ Magic link email auth (no passwords) — use Lucia or Auth.js
- ✅ Migrate all storage keys to user-scoped database rows
- ✅ "Migrate from local" button: reads existing `localStorage` and POSTs to backend on first sign-in

---

## 6. Inventory tracking with depletion forecast

Know when you're running low on a product before you run out.

- ☐ Add `volume_ml` and `usage_per_wash_ml` fields per kit item (seed defaults from Bowden's product pages)
- ☐ Each wash log entry decrements running totals for products used
- ☐ "Running low" indicator when below 20% remaining
- ☐ Couple with price tracker: "Nanolicious is 30% off and you're at 15% remaining — buy now"

---

## 7. Weather-aware wash recommendations ✅

Don't recommend a wash when rain is forecast; surface protection reminders before hot weather.

- ✅ Store user postcode in settings (Vehicle details section)
- ✅ Integrate weather forecast API — Nominatim (postcode → lat/lon) + Open-Meteo (daily forecast); proxied through backend to avoid CORS
- ✅ If rain forecast in next 24h, show "wait until [day]" hint on wash-due card
- ✅ If 35°C+ forecast for the week, surface Bead Machine reapplication banner if due soon

**Notes:**
- BOM (`api.weather.bom.gov.au`) was attempted but blocks both browser requests (CORS) and Render's datacenter IPs. Open-Meteo geocoding also doesn't support postcode lookups. Final stack: Nominatim for AU postcode → lat/lon, Open-Meteo for 7-day forecast. Backend caches results for 3 hours.
- Weather cards are in the log tab below the streak bar. Section stays hidden if no postcode is set or the API is unreachable.

---

## 8. Product comparison + alternative suggestions

When a Bowden's product is unavailable, suggest an equivalent.

- ☐ Define static mapping: `{ "Bead Machine": ["Gyeon Wet Coat", "P&S Bead Maker"], ... }`
- ☐ Surface alternatives on each product page in the technique guide
- ☐ (Later) Cross-brand price tracking: "Bead Machine is $50, Gyeon Wet Coat is $35 today"

---

## 9. Maintenance log + Schedule page

Service records, tyre rotations, tyre pressure checks, rego renewal dates. Will include a dedicated Schedule page where wash frequency settings (currently in Routines → Configure) will live alongside maintenance reminders.

- ☐ New "Maintenance" tab alongside the wash log
- ☐ Same entry shape as wash log: date, type, notes
- ☐ Recurring reminder support (rego renewal annually, etc.)
- ☐ `.ics` export for calendar integration
- ☐ Move wash frequency settings from Routines → Configure to the new Schedule page

---

## 10. Export PDF report

Printable kit-and-technique reference for offline / glovebox use.

- ☐ Extend existing `@media print` styles
- ☐ Server-side PDF generation via Puppeteer or Playwright
- ☐ "Export PDF" button in settings
- ☐ (Optional) Per-session printable wash receipt

---

## 11. Community sharing

Let other Australian car owners use this as a starting template.

- ☐ Extract static product/technique data from hardcoded HTML into JSON
- ☐ Templating: user picks car model and starting kit
- ☐ "Use as template" fork flow
- ☐ Shared library of car/product combos

**Note:** Significant rewrite — only worth pursuing if the app sees real adoption beyond personal use.

---

## Architecture milestones (prerequisite work)

- ✅ Stand up database and `/api/health` endpoint
- ✅ Ship scraper pipeline end-to-end across four retailers
- ☐ Reorganise into proper structure: split CSS, JS, HTML; add Vite build step
- ☐ Add tooling: ESLint, Prettier, TypeScript config, Husky pre-commit hook
