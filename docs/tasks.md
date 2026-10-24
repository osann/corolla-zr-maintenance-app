# Tasks

Backlog ranked by usefulness × feasibility. Each item is independently shippable. Background on finished work is in [decisions.md](decisions.md) and the git history.

## Open

### Scraping health
- ☐ **Alert on stale prices.** The Auto Barn runner was offline from 2026-09-19 to 2026-10-21 and nobody noticed for a month. Every daily run was silently cancelled. Add a check, for example in the 08:00 UTC digest cron, that flags any active retailer with no `price_history` rows in the last ~3 days. Also include a flag on the front end, displaying a warning over the product and when hovering over it states how long the products price hasnt been updated.
- ☐ **Fill price-coverage gaps** left by retiring Repco, Autopro and Bowden's (as of 2026-10-21):
  - `303-aerospace` has no remaining price source;
  - 21 products have only one of Supercheap / Auto Barn.

  Find the missing retailer URLs and add them via the Products tab.
- ☐ Occasionally check whether Repco, Autopro or Bowden's Own have lifted their bot blocks (commands in [blocked-retailers.md](blocked-retailers.md)).

### 10. Community sharing
Only worth it if the app sees use beyond one person; it's a significant rewrite.
- ☐ Extract static product/technique data from HTML into JSON
- ☐ Car model + starting kit templating, "use as template" fork flow, shared library

### Architecture (optional)
- ☐ Replace inline `on*=` handlers with delegated listeners, removing the `window` exposure list in `js/main.js`. A function missing from that list currently fails silently until its button is clicked.
- ☐ Frontend tests: the headless smoke checks from the 2026-10 cleanup (every tab signed in/out, the inline-handler audit, backup round trip) only exist as throwaway scripts. Adding them to the repo and CI would catch regressions the backend tests can't.

## Done

1. **Price tracking + alerts.**
   - Scrapers for Supercheap and Auto Barn, sale detection, sparklines, per-product thresholds, a daily digest, and full product lifecycle from the UI.
   - Repco, Autopro and Bowden's Own were retired as bot-blocked in 2026-10.
2. **Routines overhaul.** Fully customisable `corolla-routines-v1`, CSV import/export, an AI prompt template, drag reorder.
3. **Wash reminders.** Per-routine schedules, reminder cards, rain-aware best wash day, TickTick/email cron.
4. **Photo log.** R2 storage, thumbnails, carousel and lightbox.
4a. **Log UX.** Ellipsis menu, inline confirms, editing past entries, a routine-driven form.
5. **Multi-device sync.** Magic-link auth, all storage keys synced per user.
6. **Inventory.** Depletion forecast from routine usage, packs (backend-configured), size-variant fallback, editable categories with an "Other" fallback.
7. **Weather-aware recommendations.** Rain delay, Bead Machine heat banner (Nominatim + Open-Meteo).
9. **Maintenance tracker.** Time/odometer intervals, history-derived last-completed, CSV import/export.
11. **2026-10 repo cleanup.**
    - Deploy publishes only frontend files.
    - Tuesday scrape uses the live catalogue.
    - Dead code removed, and two crash bugs fixed.
    - CI added: typecheck, ESLint, Prettier, Vitest.
    - Frontend split into ES modules under `js/`.
    - Docs consolidated in `docs/`.
    - Blocked retailers removed, with their details archived.
    - Full backup export plus restore, and corrected Data management copy.
