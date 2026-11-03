# Tasks

Backlog ranked by usefulness × feasibility. Each item is independently shippable. Background on finished work is in [decisions.md](decisions.md) and the git history.

## Open

### Catalogue
- ☐ **Two probable duplicates.** Decide, then retire the extra one with `duplicateOf` in `lib/retire.ts`, as was done for `little-chubby-v2`. Found 2026-11-03.
  - `nanolicious-shag-pack` and `nanolicious-wash-pack-ultimate` share Supercheap's URL (`SPO6388657`), and Bowden's SKU for its Nanolicious Wash Pack is `BONANOSP` (shag pack). It's one pack: Nanolicious 500ml, Shagtastic, The Big Green Sucker and Boss Gloss 125ml. The shag pack's seeded components list only the first two.
  - `nanolicious-wash-2l` and `bowden-s-own-nanolicious-wash-v2-2l` share Supercheap's URL (`738544`). Auto Barn lists them separately (`CC06486`, `340315`) at the same price, and Bowden's sells one 2L.
- ☐ **The frontend `CATALOG` still uses old slugs** for products renamed in the app (e.g. `wheely-clean-v2-500ml`, live `wheely-clean-500ml`), so the checklist and routine pickers offer both, and `INVENTORY_DEFAULTS`/`SLUG_FAMILIES` miss the live slug. `seed.ts` was brought in line on 2026-11-03 (see [decisions.md](decisions.md#data)); `js/data.js` needs the same, plus a migration for signed-out browsers' local data.
- ☐ `sweet-rubber-700-ml` is Supercheap's 770ml; only its name and slug say 700.

### Scraping health
- ☐ **Remaining single-retailer products** (as of 2026-11-03, with Bowden's Own back):
  - **Supercheap's own 770ml sizes**, which nobody else sells: `wheely-clean-770ml`, `naked-glass-770ml`, `orange-agent-cleaner-770ml`, `sweet-rubber-700-ml`. Supercheap's Tyre Sheen 770ml (`588685`) isn't tracked; until 2026-11-03 its URL was wrongly on `tyre-sheen-500ml`.
  - **Auto Barn only:** `wet-dreams-5l`, `happy-ending-5l`. Bowden's doesn't list these 5L sizes.
  - `karcher-k2` (not a Bowden's product) and `nanolicious-shag-pack` (see duplicates above).
- ☐ **Make sure the self-hosted runner starts on boot.** `debian-server` went offline twice, from 2026-09-19 to 2026-10-21 and from 2026-10-24 to 2026-11-03, and both the Auto Barn and Bowden's Own scrapes depend on it.
- ☐ **Bowden's was-price.** Nothing was on sale when the scraper was written, so it reads no was-price. When something is, check the markup and pass it as `compareAtCents`.
- ☐ Occasionally check whether Repco or Autopro have lifted their bot blocks. The commands and a log of past checks are in [blocked-retailers.md](blocked-retailers.md); the last check was 2026-11-03.

### 10. Community sharing
Invite-only accounts exist now (2026-10). This is the next step if other people actually use them, and it's a significant rewrite.
- ☐ Extract static product/technique data from HTML into JSON
- ☐ Car model + starting kit templating, "use as template" fork flow, shared library

## Done

1. **Price tracking + alerts.**
   - Scrapers for Supercheap and Auto Barn, sale detection, sparklines, per-product thresholds, a daily digest, and full product lifecycle from the UI.
   - Repco, Autopro and Bowden's Own were retired as bot-blocked in 2026-10. Bowden's Own came back in 2026-11, from the home runner.
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
14. **Backlog pass (2026-11).**
    - An overdue routine is reminded the first morning it's due, then weekly, instead of every morning. `GET /api/sync` no longer sends server-only rows such as TickTick tokens.
    - 303 Aerospace is gone from the kit, the guide and every account. `little-chubby-v2` was a duplicate and is merged into `the-chubby-wheel-brush`. Both are retired on boot by `initDb()` (`lib/retire.ts`).
    - Bowden's Own is scraped again, from the home runner, for 67 products, including sizes that aren't a page's default. Products priced at only one retailer went from 21 to 8.
    - `seed.ts` mirrors production again. Three wrong or dead URLs are retired on boot: Supercheap's Flash Prep 500ml (gone), and the Auto Barn 1L on Wipe Out 500ml and Supercheap 770ml on Tyre Sheen 500ml.
    - Block check on 2026-11-03: Repco and Autopro still block.
