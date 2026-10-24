# Decisions and incidents

Why the non-obvious parts of this app are the way they are. Rules derived from these live in [CLAUDE.md](../CLAUDE.md); scraper-specific lessons live in [scraper-learnings.md](scraper-learnings.md). Newest first within each section.

## Hosting and auth

**Invite-only multi-user accounts (2026-10).** The app was built for one person and now has invited users, each with their own data. Plan and per-phase notes are in [multi-user-plan.md](multi-user-plan.md). Choices that aren't obvious from the code:
- **The admin comes from `OWNER_EMAIL`, not a DB role.** There's one admin and no promotion UI, so a role column would only add a second source of truth that could drift from the env var. Unset means no admin, and existing users can still sign in.
- **An invite is a 7-day magic-link token.** Accepting one is an ordinary sign-in, so there's no separate sign-up flow. Invites are bound to an email address, and a pending invite is simply a user row with `joined_at` null.
- **Categories are shared, not per user.** Products are assigned to categories from the Products tab, which only the admin has, so per-user categories would leave every new product in each user's "Other" card. They moved to `shared_data`.
- **Renames are applied server-side to every account.** Before, a slug or name rename only rewrote the acting browser's checklist, inventory, alerts and routines, which would have quietly broken everyone else's.
- **Switching accounts clears local data.** Without it, if one person's session expired on a shared device and someone else signed in, the second account would show the first person's local copies of any stores it didn't have yet, and push them into its own account on the first save.
- Hiding admin-only UI is cosmetic. Every admin action is enforced on the server.

**TickTick routes weren't actually guarded (fixed 2026-10).** `/ticktick/auth`, `/projects` and `/disconnect` ran `sessionMiddleware`, but that only sets `userId` (null for strangers) and never rejects. Nothing checked it, so any visitor could disconnect the owner's TickTick. The OAuth callback also had no `state`, so anyone could authorise their own TickTick account against our client ID and have their tokens stored as the owner's. The routes now use `requireAdmin`, and the callback only accepts a `state` that `/ticktick/auth` issued. This came up while planning multi-user accounts ([multi-user-plan.md](multi-user-plan.md)), where the admin is defined as whoever signs in as `OWNER_EMAIL`.

**Only frontend files are deployed (2026-10).** `deploy.yml` used to upload the repo root, so backend source, docs and `.claude/settings.local.json` were publicly served from `corolla.jhosan.top`. No credentials were exposed. It now publishes an assembled `_site/`.

**`/api` goes through a Cloudflare Worker (2026-07).** With the frontend on `corolla.jhosan.top` and the API on Render, the session cookie was third-party. Brave blocks those outright, and Safari does unless cross-site tracking protection is off, so sign-in kept silently dying. Routing `/api/*` through a Worker on the frontend's domain makes the cookie first-party with no CORS involved.

**Don't Git-import the Worker.** The first attempt used Cloudflare's "Import a repository" flow. It pulled in the whole repo, auto-detected a static-assets project, committed a `wrangler.jsonc` via `cloudflare-workers-and-pages[bot]` (branch `cloudflare/workers-autoconfig`, since deleted), and never ran the proxy script. Every `/api` request returned a bare 404 with neither `X-Github-Request-Id` nor `X-Render-Origin-Server`. The fix was deleting it and recreating a blank dashboard Worker with the code pasted in.

**Session-invalid path must reset sync state.** When the proxy migration invalidated a live session, `checkAuthAndSync()` returned early without clearing the optimistic `syncEnabled = true` restored from the auth cache. The UI kept showing signed-in controls that then 401'd on every write.

**Render keep-alive.** Render's free tier sleeps after 15 minutes idle, which also stops node-cron. A cron-job.org monitor pings `/api/health` every 10 minutes.

## Data

**Tombstones for deleted products (2026-07).** `seed()` runs on every Render boot and used to resurrect products deleted from the UI. `deleted_products` records the slug, and `seed()` skips it.

**`seed()` crash on renamed slugs (fixed 2026-07-14).** `products.name` and `products.slug` are both unique. After a slug rename, the old `onConflictDoNothing()` upsert hit a name conflict while the slug lookup found nothing, and the throw took down the whole `npm start` chain in production. `seed()` now looks up by slug, then by name, then inserts.

**No reliance on FK cascades.** libSQL/Turso never has `PRAGMA foreign_keys` enabled here, so `ON DELETE CASCADE` in the schema is decorative. Delete handlers remove child rows explicitly.

**Category system unified (2026-07).** Built-in categories were originally hardcoded with a per-product override layer (`corolla-category-overrides-v1`), and user categories were stored separately (`corolla-custom-categories-v1`). Both were folded into one editable `corolla-categories-v1`, migrated once on first load. The "Other" fallback card exists because uncategorised products became invisible, twice.

**Packs moved to the backend.** Multi-buy bundles were a hardcoded `BUNDLE_COMPONENTS` map in the frontend. They're now `pack_components` rows configured from the Products tab, cached client-side for offline expansion.

## Scraping

**Stale-price alerts (2026-10-24).** The Auto Barn runner was offline from 2026-09-19 to 2026-10-21 and nobody noticed. GitHub quietly cancels jobs that no runner picks up, and the app kept showing the last prices it had. Now the 08:00 UTC job emails the admin whenever a retailer with URLs has had no new price for 3 days. Both scrapers run daily, so that allows for a couple of failed runs. The email repeats daily until prices come back.
- The email is per retailer, because a whole retailer stopping is what went unnoticed.
- A single product's stale price usually means one broken or discontinued URL. That shows as a ⚠ in the UI instead, since a daily email about it would be noise. The first pass found one: an Auto Barn bucket listing that had returned 404 since June.

**Retailer URLs must be on the retailer's site (2026-10-24).** Two Auto Barn URLs had been saved in Supercheap fields. Supercheap's scraper can't read Auto Barn pages, so they never got a price, and nothing showed it. The product routes now reject a URL that isn't on the retailer's own site. `initDb()` also deletes any such row on boot, the same way it handles retired retailers, because there are no local Turso credentials for a one-off fix.

**Bowden's Own blocks cloud IPs, not home ones (2026-10-24).** Every earlier attempt ran from GitHub Actions or Render. From a home connection, every archived URL tried returned a server-rendered price. Bringing it back is in [tasks.md](tasks.md), and the selector and the size-variant caveat are in [blocked-retailers.md](blocked-retailers.md).

**Blocked retailers removed (2026-10-21).** Repco (Cloudflare, since about 2026-08-16), Autopro (Imperva, since about 2026-09-25) and Bowden's Own (never scrapeable) all block bots, so their scrapers, retailer URLs and price history were deleted rather than left half-working. Supercheap and Auto Barn are the remaining sources. The knowledge and a CSV of every URL are kept in [blocked-retailers.md](blocked-retailers.md). The cleanup runs in `initDb()` on every boot instead of as a one-off script for two reasons: there are no local Turso credentials, and it also catches any rows re-added later. The DB `CHECK` constraint was left permissive so a retailer can come back without a table rebuild.

**Repco disabled (2026-08-27).** From about 2026-08-16, every Repco product page returns 403 with `Cf-Mitigated: challenge`. The same response comes back from a plain curl and from a residential IP using the stealth Playwright context, so it can't be fixed client-side. Removed entirely on 2026-10-21 (see above).

**Ephemeral scrapers read the live catalogue (2026-07).** GitHub Actions and the self-hosted runner have no Turso credentials and used to scrape a list re-seeded from `seed.ts`. Anything added through the Products tab was invisible to them indefinitely. They now call `GET /api/products` via `fetchRowsFromBackend()`. The Tuesday Supercheap workflow was missed in that change and was fixed in 2026-10.

**Auto Barn via a home runner.** Auto Barn returns 403 to all cloud IPs (GitHub-hosted runners and Render alike), so it runs on `debian-server` from a residential IP. About half its product URLs hang server-side whatever the client; Playwright was tried and didn't help. It pushes in batches of 10 so a crash loses at most one batch. If its workflow runs show "cancelled", the runner is offline: GitHub cancels jobs no runner picks up within 24 hours. That happened from 2026-09-19 to 2026-10-21, when the runner service hadn't been restarted.

**Bowden's Own is never scraped.** GitHub Actions gets a Cloudflare JS challenge and Render gets a hard 403. An OzBargain-RSS sale detector was tried briefly in May 2026 and removed. Production still had 20 leftover `bowdens` URLs (never scraped, origin unknown); they were deleted with the other blocked retailers in 2026-10.

## Reminders

**A routine with no types counts only its own sessions (2026-10-24).** A routine's `types` exist to match legacy log entries (`full`/`quick`/`interior`/`both`) from before entries recorded a routine id. The cron treated a routine with no types as matching every entry. So any session, say an interior tidy, reset an exterior routine's timer and suppressed its reminder, while the app correctly showed it overdue. The app's rule was the right one. `test/reminder-matching.test.ts` now runs the real frontend function against the backend's, so the two can't drift again.

**The no-schedule fallback stays.** With no schedules set, the cron still sends a reminder 14 days after the last session, while the app shows no card. That fallback predates schedules. Removing it would quietly stop reminders for anyone relying on it, so the Schedules copy now says how it works instead.

## Weather

BOM (`api.weather.bom.gov.au`) blocks browser CORS and Render's IPs. Open-Meteo's geocoder can't look up Australian postcodes. The working stack is Nominatim (postcode → lat/lon) plus the Open-Meteo forecast, proxied and cached for 3 hours on the backend.

## Frontend

**ES modules, no bundler (2026-10).** The ~6,800-line `app.js` was split into `js/` modules mechanically, using scope analysis rather than hand edits. Vite was considered and rejected: one person maintains this app, and native modules keep deploys a file copy.

The constraints that shaped the result:
- Imported bindings are read-only, so all 35 reassigned top-level variables moved onto one `state` object.
- Inline `on*=` handlers resolve against `window`, so `main.js` exposes the 118 functions they call.
- Feature modules import each other in cycles, which is safe only because nothing but leaf-module constants runs at import time.
- `deploy.yml` stamps module URLs with the commit SHA, because separately cached modules could otherwise mix versions after a deploy.

**Inline handlers stay; delegated listeners declined (2026-10-24).** Replacing the 166 inline `on*=` handlers with delegated listeners would remove the `window` list in `main.js`. That list's real risk, a missing function failing silently, is now caught in CI: `test/inline-handlers.test.ts` reads every handler in the source and checks the list both ways. The rewrite would touch every feature module, most of whose flows have no tests, and would add a dispatch convention, all for no visible change.
- The assessment turned up one real bug class, now fixed. Text passed as `'${escAttr(x)}'` was decoded back before the handler ran, so an apostrophe broke the button (a routine named "Bob's wash" lost its Send to TickTick button). Text arguments now go through `jsArg()`, and the same test rejects `escAttr(` inside a handler.
- Revisit if the site ever wants a Content-Security-Policy without `'unsafe-inline'`.

**Frontend tests (2026-10-24).** There are two layers.
- Pure logic: Vitest imports the frontend modules directly, with `window` stubbed.
- Browser: `backend/test/e2e/` drives the real backend and frontend in headless Chromium. It uses the `playwright` library the scrapers already install, so there's no `@playwright/test` and no new dependency.

The browser tests run in Sydney time with an optional fixed clock. That's how the reminder cards' off-by-one across DST turned up.

**`BACKEND_URL.startsWith('__')`, not equality.** `deploy.yml` runs a global `sed` on `__BACKEND_URL__`, which would also rewrite the string in an `=== '__BACKEND_URL__'` comparison and break the guard.

**Slug rename doesn't use `saveChecklist()`.** `saveChecklist()` rebuilds `checked` from the `itemData` snapshot taken at the last render, which still holds the old slug, so it would silently undo the rename.

**Lint caught two crash bugs (2026-10).** Adding ESLint surfaced two `no-undef` errors, both reproduced in a headless browser before fixing:
- `showTab()` was never defined, so returning from TickTick OAuth aborted `init()`.
- `defaults` was left undefined by the volume-override refactor, which broke the Inventory render for any product with no stored volume.

Keep `no-undef` on.

**Removed features (2026-10 cleanup):**
- the budget target
- the settings-based routine step editor and frequency steppers (superseded by `corolla-routines-v1` and Schedules)
- `applySchedule()`
- the unused catalogue `<datalist>`

`corolla-budget-v1` is still cleared on sign-out/reset.
