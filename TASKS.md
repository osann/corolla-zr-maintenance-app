# Tasks

Backlog ranked by usefulness × feasibility. Each item is independently shippable. Background on finished work is in [docs/decisions.md](docs/decisions.md) and the git history.

## Open

### Follow-ups from the 2026-10 cleanup
- ☐ **Backup export is incomplete.** `exportData()` exports only checklist, wash log and settings. It misses routines, maintenance items and log, inventory, categories and price alerts, and there's no import.
- ☐ **Data management copy is wrong when signed in.** Settings → Data management says "All data is stored in this browser only — nothing is sent anywhere", which isn't true with sync on.
- ☐ Rename `fetchBomForecast()`; it hasn't called BOM since the Nominatim/Open-Meteo switch.

### 8. Product comparison + alternative suggestions
When a Bowden's product is unavailable, suggest an equivalent.
- ☐ Static mapping, e.g. `{ "Bead Machine": ["Gyeon Wet Coat", "P&S Bead Maker"] }`
- ☐ Surface alternatives in the technique guide
- ☐ (Later) cross-brand price tracking

### 10. Community sharing
Only worth it if the app sees use beyond one person; it's a significant rewrite.
- ☐ Extract static product/technique data from HTML into JSON
- ☐ Car model + starting kit templating, "use as template" fork flow, shared library

### Scraping
- ☐ Periodically check whether Repco's Cloudflare challenge has lifted (`npm run scrape` locally).

### Architecture
- ✅ Database, `/api/health`, four-retailer scraper pipeline
- ✅ CI type-check on every push / PR (`.github/workflows/ci.yml`)
- ✅ Backend smoke tests (Vitest) for seeding and price ingestion
- ✅ ESLint + Prettier config
- ✅ Frontend split into ES modules under `js/` (no build step)
- ☐ Optional: replace inline `on*=` handlers with delegated listeners, removing the `window` exposure list in `main.js`

## Done

1. **Price tracking + alerts.** Scrapers for Supercheap, Auto Barn and Autopro (Repco disabled 2026-08), sale detection, sparklines, per-product thresholds, a daily digest, and full product lifecycle from the UI.
2. **Routines overhaul.** Fully customisable `corolla-routines-v1`, CSV import/export, an AI prompt template, drag reorder.
3. **Wash reminders.** Per-routine schedules, reminder cards, rain-aware best wash day, TickTick/email cron.
4. **Photo log.** R2 storage, thumbnails, carousel and lightbox.
4a. **Log UX.** Ellipsis menu, inline confirms, editing past entries, a routine-driven form.
5. **Multi-device sync.** Magic-link auth, all storage keys synced per user.
6. **Inventory.** Depletion forecast from routine usage, packs (backend-configured), size-variant fallback, editable categories with an "Other" fallback.
7. **Weather-aware recommendations.** Rain delay, Bead Machine heat banner (Nominatim + Open-Meteo).
9. **Maintenance tracker.** Time/odometer intervals, history-derived last-completed, CSV import/export.
