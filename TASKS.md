# Tasks

Backlog items ranked by usefulness × feasibility. Work top-to-bottom — each item is independently shippable.

---

## 1. Price tracking + alerts

Know when products drop in price at Australian retailers.

- [ ] Add retailer URLs to each kit item (Supercheap Auto, Repco, Autopro, Bowden's direct)
- [ ] Build scraper for Bowden's Own (Shopify JSON-LD — easiest, start here)
- [ ] Build scraper for Supercheap Auto (internal `/api/search` JSON endpoint)
- [ ] Build scraper for Repco (JS-rendered, use Playwright; 5s delay between requests)
- [ ] Build scraper for Autopro (straightforward HTML)
- [ ] Store price observations: `price_history(product_id, retailer, price, observed_at, on_sale_flag)`
- [ ] Detect "on sale": strike-through pricing in DOM, or >15% drop below 30-day rolling average
- [ ] API endpoints: `GET /api/products/:id/prices` and `GET /api/alerts`
- [ ] Spend tab UI: sparkline per item, flame icon for items below RRP, recent price drops list
- [ ] Per-item alert thresholds (e.g. "notify me when Nanolicious 5L drops below $55")
- [ ] Email digest notifications — at most once per day

**Notes:**
- Cache prices for 6 hours minimum
- Set a real User-Agent header identifying the project
- Rate-limit aggressively, respect robots.txt

---

## 2. Wash session reminders

Push notification when a wash is due based on frequency settings and last log entry.

- [ ] Read `settings.freq.fullWash` and most recent `washLog` entry to calculate next-due date
- [ ] Implement Web Push (Push API + service worker) or email via the same notification system as price alerts
- [ ] Daily cron: check all users, send notifications for anything due today or overdue
- [ ] "Snooze" button that adds 3 days to next-due date
- [ ] Streak-protection alert: "don't break your N-week streak — wash due tomorrow" (reuse `calcStreak()`)

---

## 3. Photo log per session

Attach before/after photos to wash log entries.

- [ ] Add file upload input to the log entry form
- [ ] Backend: store photos in S3-compatible object storage (Cloudflare R2)
- [ ] Generate thumbnails server-side
- [ ] Display thumbnails in log entry cards as a small grid
- [ ] Strip EXIF data server-side for privacy

---

## 4. Multi-device sync

Access data from phone + desktop after moving storage to the backend.

- [ ] Magic link email auth (no passwords) — use Lucia or Auth.js
- [ ] Migrate all storage keys to user-scoped database rows
- [ ] "Migrate from local" button: reads existing `localStorage` and POSTs to backend on first sign-in

---

## 5. Inventory tracking with depletion forecast

Know when you're running low on a product before you run out.

- [ ] Add `volume_ml` and `usage_per_wash_ml` fields per kit item (seed defaults from Bowden's product pages)
- [ ] Each wash log entry decrements running totals for products used
- [ ] "Running low" indicator when below 20% remaining
- [ ] Couple with price tracker: "Nanolicious is 30% off and you're at 15% remaining — buy now"

---

## 6. Weather-aware wash recommendations

Don't recommend a wash when rain is forecast; surface protection reminders before hot weather.

- [ ] Store user postcode in settings
- [ ] Integrate BOM forecast API (`api.weather.bom.gov.au`)
- [ ] If rain forecast in next 24h, show "wait until [day]" hint on wash-due card
- [ ] If 35°C+ forecast for the week, surface Bead Machine reapplication banner if due soon

---

## 7. Product comparison + alternative suggestions

When a Bowden's product is unavailable, suggest an equivalent.

- [ ] Define static mapping: `{ "Bead Machine": ["Gyeon Wet Coat", "P&S Bead Maker"], ... }`
- [ ] Surface alternatives on each product page in the technique guide
- [ ] (Later) Cross-brand price tracking: "Bead Machine is $50, Gyeon Wet Coat is $35 today"

---

## 8. Maintenance log beyond detailing

Service records, tyre rotations, tyre pressure checks, rego renewal dates.

- [ ] New "Maintenance" tab alongside the wash log
- [ ] Same entry shape as wash log: date, type, notes
- [ ] Recurring reminder support (rego renewal annually, etc.)
- [ ] `.ics` export for calendar integration

---

## 9. Export PDF report

Printable kit-and-technique reference for offline / glovebox use.

- [ ] Extend existing `@media print` styles
- [ ] Server-side PDF generation via Puppeteer or Playwright
- [ ] "Export PDF" button in settings
- [ ] (Optional) Per-session printable wash receipt

---

## 10. Community sharing

Let other Australian car owners use this as a starting template.

- [ ] Extract static product/technique data from hardcoded HTML into JSON
- [ ] Templating: user picks car model and starting kit
- [ ] "Use as template" fork flow
- [ ] Shared library of car/product combos

**Note:** Significant rewrite — only worth pursuing if the app sees real adoption beyond personal use.

---

## Architecture milestones (prerequisite work)

Before the above features can ship, the app needs a real backend:

- [ ] Reorganise into proper structure: split CSS, JS, HTML; add Vite build step
- [ ] Add tooling: ESLint, Prettier, TypeScript config, Husky pre-commit hook
- [ ] Stand up database and `/api/health` endpoint (prove the architecture)
- [ ] Ship scraper pipeline end-to-end for one product on Bowden's direct before scaling out
