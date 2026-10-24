# Tasks

Backlog ranked by usefulness × feasibility. Each item is independently shippable. Background on finished work is in [decisions.md](decisions.md) and the git history.

## Open

### Wash reminders
- ☐ **Overdue reminders repeat every morning.** The 07:00 UTC cron sends a new TickTick task (or email) each day a routine stays overdue, so a week's lapse leaves seven duplicate tasks. Send one when the routine falls due, then at most weekly, for example by remembering the last reminder per schedule on the server. Found 2026-10-24.

### Scraping health
- ☐ **Bring back Bowden's Own, from the home runner.** On 2026-10-24 bowdensown.com.au served real prices to a plain request from a home connection. It had only ever been tried from cloud IPs. It sells every size and pack, so it would close most of the gaps below. It needs:
  - a small fetch scraper, run next to Auto Barn on `debian-server`;
  - a URL per size, because the size-variant pages show the default size's price;
  - the steps under "Restoring a retailer in general" in [blocked-retailers.md](blocked-retailers.md), which also has the selector.
- ☐ **Remaining single-retailer products** (as of 2026-10-24). Each was searched for on both retailers, and the missing retailer doesn't stock that size or pack:
  - **Supercheap only:** `wheely-clean-770ml`, `naked-glass-770ml`, `sweet-rubber-700-ml`, `orange-agent-cleaner-770ml`, `all-sort-applicator-1pk` (Auto Barn only has the 2-pack), `little-chubby-v2`, `karcher-k2`, and the packs `bowden-s-own-claying-rubber-pack-bofcrp`, `bowden-s-own-beautiful-beads-pack-bomachinep`, `nanolicious-shag-pack` and `the-essentials-starters-kit`.
  - **Auto Barn only:** `wet-dreams-5l`, `happy-ending-5l`, `snow-job-5l`, `big-softie-blue`, `sweet-rubber-500ml`, `wipe-out-1l`, `naked-glass-500ml`, `wheely-clean-500ml`, `fabratection-500ml`, `foursome-brush-set`, `orange-agent-500ml`.
  - **No source:** `303-aerospace` is the 473 ml bottle, which no tracked retailer sells. Auto Barn has the 946 ml (`CC00692`, $77.99 on 2026-10-24), and it could be added as its own product.
- ☐ **`little-chubby-v2` looks like a duplicate of `the-chubby-wheel-brush`.** Its only URL, Supercheap `700985`, is titled "The Chubby Wheel Brush V2" and is also The Chubby's Supercheap URL. Bowden's own site has no Little Chubby. Delete it in the Products tab, and from `CATALOG` and `seed.ts`, if it isn't a real product.
- ☐ Occasionally check whether Repco, Autopro or Bowden's Own have lifted their bot blocks. The commands and a log of past checks are in [blocked-retailers.md](blocked-retailers.md); the last check was 2026-10-24.

### 10. Community sharing
Invite-only accounts exist now (2026-10). This is the next step if other people actually use them, and it's a significant rewrite.
- ☐ Extract static product/technique data from HTML into JSON
- ☐ Car model + starting kit templating, "use as template" fork flow, shared library

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
12. **Invite-only multi-user accounts (live 2026-10-24, PR #6).** Details in [multi-user-plan.md](multi-user-plan.md).
    - The admin is the `OWNER_EMAIL` account. Product, URL and pack writes are admin-only, and the TickTick routes, which were never actually guarded, are fixed.
    - Notifications, the cron jobs and TickTick work per user.
    - Categories are shared and admin-edited. Product renames reach every account.
    - Invite, resend and remove users from Settings → Users. Invites are 7-day magic links.
    - Admin-only UI is hidden from regular users, and switching accounts on a device clears the previous account's local data.
13. **Reminders, scraping health and frontend tests (2026-10-24).**
    - The app and the cron agree on which sessions count for a routine: one with no types counts only its own. A never-logged routine says so, and day counts are right across DST.
    - The admin gets a daily email while a retailer has gone 3 days without a price. A ⚠ marks stale prices on the Prices tab, and stale or never-priced URLs on the Products tab.
    - Price coverage pass: one URL was replaced and one added. A retailer URL must now be on that retailer's site, which removed two wrong ones. What's still missing is listed above.
    - Frontend tests run in CI: a static inline-handler audit, plus headless browser smoke tests. Text arguments in inline handlers go through `jsArg()`.
    - Replacing inline handlers with delegated listeners was assessed and declined ([decisions.md](decisions.md#frontend)).
