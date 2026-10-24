# Decisions and incidents

Why the non-obvious parts of this app are the way they are. Rules derived from these live in [CLAUDE.md](../CLAUDE.md); scraper-specific lessons live in [scraper-learnings.md](scraper-learnings.md). Newest first within each section.

## Hosting and auth

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

**Blocked retailers removed (2026-10-21).** Repco (Cloudflare, since about 2026-08-16), Autopro (Imperva, since about 2026-09-25) and Bowden's Own (never scrapeable) all block bots, so their scrapers, retailer URLs and price history were deleted rather than left half-working. Supercheap and Auto Barn are the remaining sources. The knowledge and a CSV of every URL are kept in [blocked-retailers.md](blocked-retailers.md). The cleanup runs in `initDb()` on every boot instead of as a one-off script for two reasons: there are no local Turso credentials, and it also catches any rows re-added later. The DB `CHECK` constraint was left permissive so a retailer can come back without a table rebuild.

**Repco disabled (2026-08-27).** From about 2026-08-16, every Repco product page returns 403 with `Cf-Mitigated: challenge`. The same response comes back from a plain curl and from a residential IP using the stealth Playwright context, so it can't be fixed client-side. Removed entirely on 2026-10-21 (see above).

**Ephemeral scrapers read the live catalogue (2026-07).** GitHub Actions and the self-hosted runner have no Turso credentials and used to scrape a list re-seeded from `seed.ts`. Anything added through the Products tab was invisible to them indefinitely. They now call `GET /api/products` via `fetchRowsFromBackend()`. The Tuesday Supercheap workflow was missed in that change and was fixed in 2026-10.

**Auto Barn via a home runner.** Auto Barn returns 403 to all cloud IPs (GitHub-hosted runners and Render alike), so it runs on `debian-server` from a residential IP. About half its product URLs hang server-side whatever the client; Playwright was tried and didn't help. It pushes in batches of 10 so a crash loses at most one batch. If its workflow runs show "cancelled", the runner is offline: GitHub cancels jobs no runner picks up within 24 hours. That happened from 2026-09-19 to 2026-10-21, when the runner service hadn't been restarted.

**Bowden's Own is never scraped.** GitHub Actions gets a Cloudflare JS challenge and Render gets a hard 403. An OzBargain-RSS sale detector was tried briefly in May 2026 and removed. Production still had 20 leftover `bowdens` URLs (never scraped, origin unknown); they were deleted with the other blocked retailers in 2026-10.

## Weather

BOM (`api.weather.bom.gov.au`) blocks browser CORS and Render's IPs. Open-Meteo's geocoder can't look up Australian postcodes. The working stack is Nominatim (postcode → lat/lon) plus the Open-Meteo forecast, proxied and cached for 3 hours on the backend.

## Frontend

**ES modules, no bundler (2026-10).** The ~6,800-line `app.js` was split into `js/` modules mechanically, using scope analysis rather than hand edits. Vite was considered and rejected: one person maintains this app, and native modules keep deploys a file copy.

The constraints that shaped the result:
- Imported bindings are read-only, so all 35 reassigned top-level variables moved onto one `state` object.
- Inline `on*=` handlers resolve against `window`, so `main.js` exposes the 118 functions they call.
- Feature modules import each other in cycles, which is safe only because nothing but leaf-module constants runs at import time.
- `deploy.yml` stamps module URLs with the commit SHA, because separately cached modules could otherwise mix versions after a deploy.

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
