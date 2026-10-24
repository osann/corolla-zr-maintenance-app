# Plan: invite-only multi-user accounts with an admin

Agreed 2026-10-21. The work is on branch `feature/multi-user`, one commit per phase, with checks green before each commit. Tick a phase off here when it's committed. Nothing reaches production until it's merged to `main`; see "Rollout order" for the order to deploy in.

## Status

- ☑ Phase 1: admin identity and route guards (backend). Committed on `feature/multi-user` 2026-10-24.
- ☑ Phase 2: per-user notifications and TickTick (backend). Committed 2026-10-24.
- ☑ Phase 3: shared categories and rename propagation. Committed 2026-10-24.
- ☑ Phase 4: invites and user management (backend). Committed 2026-10-24.
- ☑ Phase 5: frontend (admin-only UI, Users section, switching accounts). Committed 2026-10-24.
- ☑ Tests and docs, added alongside each phase. Phase 5 was checked with a headless browser instead (no frontend test suite exists; see below).
- ☐ Deploy: merge `feature/multi-user` to `main`, then work through Verification below.

## Context

The app is built for one person: `/auth/request` only issues magic links to `OWNER_EMAIL`, and every notification path (price alerts, cron reminders, digest, TickTick) looks up that one owner. It now needs several users. Sign-up is by invite only. The current account (joh.10@pm.me) is the admin, and regular users can't use catalogue configuration such as the Products tab. Each user gets their own history, settings, photos and notifications.

Most of this is already in place. All synced state lives in `user_data`, keyed by `user_id`, and photos are already filtered by `userId` (R2 keys are `photos/{userId}/…`). The work is mainly:
1. turning the hardcoded owner into "admin + invited users";
2. making notifications loop over users;
3. moving the one piece of catalogue config that's stored per account (categories) into shared storage;
4. adding invite and user-management endpoints and the admin-only UI.

**Decisions (confirmed 2026-10-21):**
- Categories are shared and only the admin edits them.
- Regular users can edit their own setup: routines, schedules, maintenance items, checklist phases, notifications, vehicle details and backups. Only the product catalogue is locked.
- New accounts start from the built-in defaults.
- Invites are tied to an email address: the invite is emailed as a 7-day link, and the link is also shown to you so you can copy it.

**Two existing security holes, both fixed in Phase 1:**
- `/ticktick/disconnect`, `/ticktick/auth` and `/ticktick/projects` ran `sessionMiddleware` but never checked `userId`, so any visitor could disconnect your TickTick account.
- The OAuth flow had no `state` parameter, so anyone could authorise their own TickTick account against the app's client ID and have it stored as yours.

## What's shared and what's per user

| Shared (admin edits, everyone reads) | Per user |
|---|---|
| `products`, `retailer_urls`, `price_history`, `pack_components`, `deleted_products` (already global) | wash log, routines, schedules, settings (vehicle, postcode, notifications, display prefs), maintenance + log, checklist, inventory, price-alert thresholds, photos, TickTick tokens |
| `corolla-categories-v1`, which moves to a new `shared_data` table | |

Admin identity is **taken from the environment, not stored in the DB**: `isAdmin = email === OWNER_EMAIL`. There's no role column or promotion UI, and nothing can drift out of sync. If `OWNER_EMAIL` is unset, nobody is admin, but existing users can still sign in.

---

## Phase 1: admin identity and route guards (backend)

Ships on its own. You stay the only user, and the TickTick hole is closed.

- **`backend/src/lib/auth.ts`**
  - `AppEnv` Variables become `{ userId: number | null; isAdmin: boolean }`.
  - Add `isAdminEmail(email)`, a case-insensitive comparison with `process.env.OWNER_EMAIL` that returns false when it's unset.
  - `sessionMiddleware` inner-joins `users`, so the email is available to set `isAdmin`. It's still a single query.
  - Add a `requireAdmin` middleware: 401 with no session, 403 for a user who isn't admin.
- **`backend/src/routes/products.ts`**: all 7 write routes switch their inline `if (!userId) 401` for `sessionMiddleware, requireAdmin`:
  - `POST /products`
  - `PUT /:id/url`
  - `PATCH /:id`
  - `PUT /:id/pack`
  - `DELETE /:id/pack`
  - `DELETE /:id/url/:retailer`
  - `DELETE /:id`

  The GET routes stay public.
- **`backend/src/routes/ticktick.ts`**, **`alerts.ts`**: typed as `Hono<AppEnv>`.
  - `/ticktick/auth`, `/ticktick/projects`, `/ticktick/disconnect` and `/notify/wash-reminder` use `requireAdmin` for now, because until Phase 2 they all act on the owner's TickTick account. `/ticktick/status` returns `{connected:false}` to anyone but the admin.
  - **OAuth `state`** (moved here from Phase 2, since it's half of the security fix): `/ticktick/auth` stores a `generateToken()` value in an in-memory map with a 10-minute expiry and adds `&state=` to the authorise URL. `/ticktick/callback` looks it up and deletes it, and redirects to `?ticktick=error` if it's missing or expired. In-memory is fine for the same reason as the magic-link cooldown map: a restart only costs a retry.
- **`users.joined_at` column** (nullable; null means the invite is still pending):
  - Added to `schema.ts` and the `users` DDL in `init.ts`.
  - The `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` loop in `initDb()` (which only handled `products`) is now a `{ table, name, ddl, backfill? }` list.
  - The backfill (`joined_at` = `created_at` as an ISO string) runs **only inside the branch that adds the column**, so later pending invites aren't marked as joined on every boot.
  - `/auth/verify` sets `joined_at` on the first sign-in (moved here from Phase 4, so the column and its writer ship together).
- **`/auth/me`** returns `{ authenticated, email, isAdmin }` (moved here from Phase 4; the frontend ignores the extra field until Phase 5).
- **Tests:** `backend/test/access.test.ts` covers the migration backfill, `joined_at` on sign-in, `isAdmin` in `/auth/me`, 401/403 on all 7 product writes and the 3 guarded TickTick routes, and the `state` check (forged, valid, replayed).

## Phase 2: per-user notifications and TickTick (backend)

Behaviour stays the same while you're the only user.

- **`backend/src/lib/ticktick.ts`**: every export takes `userId: number` instead of `ownerEmail`, and `getOwnerUserId()` is deleted.
- **`backend/src/lib/email.ts`**:
  - `getOwnerNotificationSettings(email)` becomes `getNotificationSettings(userId)`, and `getOwnerAlertThresholds` becomes `getAlertThresholds(userId)`.
  - Add `getNotificationRecipients()`, which returns `[{ userId, email, settings, thresholds }]` for every user with a non-null `joined_at`.
  - Delete `getOwnerEmail()`.
- **`backend/src/routes/prices.ts`**:
  - Load the recipients once per request.
  - For each observation: insert the row and compute `onSale` once (as now), then filter to the recipients who care (a sale alert is on, or their threshold for that slug was crossed).
  - Run the `recent` (limit 2) query only if someone cares, then apply the existing transition rules for each recipient.
  - `sendViaChannel(channel, recipient, subject, body)` sends to `recipient.email` / `recipient.userId`.
- **`backend/src/routes/alerts.ts`**: `/notify/wash-reminder` goes from `requireAdmin` to any signed-in user and uses `c.var.userId`.
- **New `backend/src/lib/notifications.ts`**: move both cron bodies out of `index.ts` as `runWashReminders()` and `runDailyDigest()`.
  - Each loops over the recipients with its own try/catch per user, so one failure doesn't stop the others.
  - `routineMatchesLog()` moves too and still mirrors `entryMatchesSchedule()` in the frontend.
  - The digest queries the sale list once and checks thresholds per user.
  - In `index.ts`, the cron handlers just call these functions, and the `OWNER_EMAIL` early returns go.
- **TickTick per user** (`routes/ticktick.ts`):
  - The Phase 1 `state` map goes from `state → expiry` to `state → { userId, expiresAt }`, and the callback calls `storeOAuthTokens(userId, …)`. The callback lands on Render directly (`BACKEND_PUBLIC_URL`) without the first-party session cookie, so `state` is the only way to know whose tokens these are.
  - `/ticktick/auth`, `/projects` and `/disconnect` go from `requireAdmin` to any signed-in user, and `/status` reports the caller's own connection.
- **Tests:** `backend/test/notifications.test.ts` (email sending mocked) covers threshold alerts going only to the user whose threshold was crossed, sale alerts to every joined user who wants them, no repeat alerts without a change, per-user digests, per-user overdue wash reminders, and pending invites getting nothing. `access.test.ts` covers TickTick tokens being stored for whoever started the flow, and disconnect touching only the caller's own.

## Phase 3: shared categories and rename propagation

- **New table `shared_data`** (`key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`) in `schema.ts` and `init.ts`.
- **One-off move in `initDb()`**, idempotent:
  - If `OWNER_EMAIL` is set and `shared_data` has no `corolla-categories-v1` row, `INSERT … SELECT` your existing `user_data` categories row, then delete that row.
  - The scraper runners have no `OWNER_EMAIL`, so it does nothing there.
- **`backend/src/routes/auth.ts`**:
  - Add `SHARED_KEYS = ['corolla-categories-v1']` and remove that key from `ALLOWED_KEYS`.
  - `GET /sync` returns the user's rows with the shared rows laid over them.
  - `POST /sync/:key` for a shared key returns 403 unless the caller is admin, then upserts `shared_data`. Other keys keep the existing path.
  - Signed-out guests keep seeding categories from `INV_CATEGORIES` locally, as now.
- **Frontend** (categories still sync through the same `syncPush`/`/api/sync`, so `catalog.js` doesn't change):
  - **`state.isAdmin`** (moved here from Phase 5, because the guard below needs it, or it would block the admin's own category edits): `js/state.js` adds it; `checkAuthAndSync()` sets it from `/auth/me`, caches `{ email, isAdmin }`, and resets it on both failure paths; `main.js` restores it from the cache; `signOut()` clears it.
  - `js/config.js`: `export const SHARED_KEYS = [CATEGORIES_KEY];`
  - `js/storage.js` `syncPush()`: return early when `SHARED_KEYS.includes(key) && !state.isAdmin`. That one guard covers the seed push in `loadCategories()`, resets, and restores.
  - `js/settings.js`:
    - `exportData()`/`parseBackup()` skip `SHARED_KEYS` for users who aren't admin.
    - `resetEverything()` no longer touches `CATEGORIES_KEY` for anyone, because categories aren't personal data any more. Its confirm copy changes to match.
- **Slug/name renames have to reach other users' data.**
  - Today `renameProductSlugEverywhere()` and `saveProductName()` (`js/products.js`) rewrite only the acting browser's checklist, inventory, alerts, categories and routines. Every other user's data would quietly break.
  - Add a new `backend/src/lib/rename.ts`:
    - `renameSlugInUserData(old, new)` rewrites each user's `corolla-checklist-v3` (`phases[].items`, `checked`), `corolla-inventory-v1` (`slug` and `slug:component` keys) and `corolla-price-alerts-v1` keys, plus the shared categories.
    - `renameProductInRoutines(oldName, newName)` rewrites each user's `corolla-routines-v1` `steps[].products[].name`.
    - Comments on both sides say to keep them in sync with the frontend functions.
  - `PATCH /products/:id` reads the old `slug, name` first (it currently selects only `id`) and calls these when either actually changed.
  - The admin's browser keeps its existing local rewrite for instant UI. Its push matches what the server already wrote.
- **Tests:** `backend/test/shared.test.ts` covers the one-off move (once only, never overwriting), admin-only writes to shared keys, every account pulling the shared categories, per-user stores staying private, and slug and name renames rewriting another user's checklist, inventory (without touching a different slug that shares a prefix), alerts, routines and the shared categories.

## Phase 4: invites and user management (backend)

- **`routes/auth.ts`**
  - `/auth/request`: replace the owner-only check. Look the email up in `users`. If there's no row and `isAdminEmail(email)`, insert one (bootstrap). If there's no row otherwise, return a silent `{ok:true}` (no enumeration, as now). The rest stays: cooldown, token invalidation, 15-minute token.
  - `/auth/verify` setting `joined_at`, and `isAdmin` in `/auth/me`, were already done in Phase 1.
- **`lib/email.ts`**: add `sendInvite(to, token)`. Factor the link-email HTML out of `sendMagicLink()` into a shared helper. The invite copy says the link is valid for 7 days.
- **New `backend/src/routes/admin.ts`**: one `router.use('/admin/*', sessionMiddleware, requireAdmin)` guards every route in it, including any added later. It's mounted in `index.ts`. It adds no new HTTP verbs, so CORS doesn't change.
  - `GET /admin/users` returns `[{ id, email, isAdmin, createdAt, joinedAt, inviteExpiresAt }]`. `inviteExpiresAt` is when a pending user's latest unused link stops working, so the UI can say an invite has expired. `createdAt` is converted to ISO, because Safari won't parse SQLite's format.
  - `POST /admin/invites { email }`:
    - lowercases the email and validates it;
    - returns 409 if that user has already joined, or is the admin;
    - otherwise creates the `users` row if it's missing;
    - deletes any unused tokens, inserts a `magic_tokens` row with `tokenExpiresAt(7 * 24 * 60)`, calls `sendInvite`, and returns `{ ok, id, link, emailed }`. `emailed` is false when Resend rejected the email. Resend 4.x reports errors in its result rather than throwing, so `sendInvite` turns them into a throw.

    Posting again is the resend: it makes a new link and invalidates the old one. An invite is just a long-lived magic token, so accepting it goes through the existing `?token=` → `/auth/verify` flow with no frontend changes.
  - `DELETE /admin/users/:id`:
    - returns 400 for the admin;
    - otherwise deletes explicitly, in this order: R2 objects for each photo (`Promise.allSettled`, as in photos.ts), then `photos`, `user_data`, `sessions`, `magic_tokens` and `users`. FK cascades aren't relied on (CLAUDE.md rule).
- **Tests:** `backend/test/accounts.test.ts` (email and R2 mocked) covers silent ignoring of unknown addresses, the admin's row being created on first sign-in, 401/403 on every admin route, invite validation (409/400), the 7-day link, `emailed: false` still returning the link, resend replacing the old link, accepting as a regular user, signing in again later, the user list, and removal (all rows, R2 objects and the session gone; the admin can't be removed; cancelling a pending invite).

## Phase 5: frontend (admin-only UI, Users section, switching accounts)

- **`state.isAdmin`** was already added in Phase 3 (state, `/auth/me`, cache, failure resets, `main.js` restore).
- **`js/auth.js`**
  - `checkAuthAndSync()`: when signed in as admin, calls `loadUsers()` without waiting for it.
  - **Account-switch guard.**
    - The problem: on a shared device, A's session expires (local data stays), then B signs in. B's remote has no entries for those keys, so A's local stores show under B and get pushed into B's account on B's first save.
    - The fix: add `LAST_USER_KEY = 'corolla-last-user-v1'` to `config.js`. On a successful `/auth/me`, if the stored last user is different from `me.email`:
      1. run `clearLocalSyncedData()`, the clear block pulled out of `signOut()`, which keeps its per-key empty values;
      2. store the new email;
      3. `location.reload()`.
    - `signOut()` clears `LAST_USER_KEY` too.
  - `renderAuthUI()`:
    - adds `document.querySelectorAll('[data-admin-only]').forEach((el) => (el.hidden = !(state.syncEnabled && state.isAdmin)))`. This relies on the existing `[hidden] { display:none !important }`;
    - if the Products sub-tab was active and is now hidden, it clicks the Inventory sub-tab;
    - drops the `categoriesSec` `style.display` lines.
  - The sign-in copy says accounts are invite-only. After a request it shows "If that email has an account, a sign-in link is on its way."
- **`js/main.js`**: add the new handlers to the `Object.assign(window, …)` list.
- **`index.html`**:
  - Add `data-admin-only` to the Products sub-tab button (`data-inv-tab="products"`), `#inv-sub-products`, `#settings-categories`, and a new `#settings-users` section placed after "Device sync". The pack and retailer modals only open from the Products page.
  - Hiding these is cosmetic. The backend enforces the 403s either way.
- **New `js/users.js`**: `loadUsers()`, `renderUsers()`, `sendInvite()`, `copyInviteLink()`, `showRemoveUserConfirm(id)`, `cancelRemoveUserConfirm(id)`, `removeUser(id)`.
  - Kept to plain prose rows: "name@x.com · joined 3 Oct 2026" or "name@x.com · invite pending · Resend".
  - After sending, a line shows the link with a Copy button.
  - Removing a user goes through an inline confirm row, per convention: "Remove name@x.com and delete their history, settings and photos? Remove / Cancel".
  - Nothing runs at import time.
- **Verified in a headless browser (2026-10-24).** Setup: the real backend on a throwaway SQLite file, a dummy Resend key, and a small same-origin proxy standing in for the Cloudflare Worker. All 34 checks passed:
  - signed out, the admin UI is hidden;
  - as admin, the Products tab, Categories and Users are shown, the list shows admin, joined and pending users, an invite returns a copyable link even when the email fails, the new invitee appears, and withdrawing an invite goes through the inline confirm;
  - as a regular user, the admin UI is hidden, the shared categories arrive, shared categories are never pushed, and the admin API returns 403;
  - switching accounts clears the previous account's local data;
  - every inline handler resolves on `window`;
  - no page errors anywhere.

  The harness was a throwaway script tied to this machine's paths. Making frontend tests permanent is still the Architecture item in tasks.md.

## Tests (`backend/test/`)

- New `accounts.test.ts`. It uses `vi.mock` to stub the send functions in `../src/lib/email.js` and `deleteFromR2` in `../src/lib/r2.js`, and creates users and sessions directly as `routes.test.ts` does. Cases:
  1. `/auth/request` for an unknown email returns 200 and creates no token; for an invited email it creates a token.
  2. Invite → verify sets the session cookie and `joined_at`. `/auth/me` reports `isAdmin` as true for the owner and false for the invitee.
  3. An invitee gets 403 on `POST /products`, `PATCH /products/:id` and `POST /sync/corolla-categories-v1`. When the admin writes categories, the invitee's `GET /sync` returns them.
  4. Isolation: user B's `GET /sync` doesn't include A's rows, and B's `GET /photos?logEntryIds=<A's>` comes back empty.
  5. `DELETE /admin/users/:id` removes that user's photos, user_data, sessions, tokens and user row, and refuses to delete the admin.
  6. A slug rename rewrites another user's checklist, inventory and alerts, plus the shared categories.
  7. `POST /prices` with two users on different thresholds emails only the user whose threshold was crossed.
- `routes.test.ts`: the owner session is admin, so the existing tests keep passing. Add one 403 case for an invitee.

## Docs

- **`CLAUDE.md`**:
  - "One user, one owner account" becomes invite-only multi-user, with the admin set by `OWNER_EMAIL`.
  - Env var notes.
  - Database: `users.joined_at`, `shared_data`, `ALLOWED_KEYS` vs `SHARED_KEYS`.
  - The "Adding a new synced store" checklist gains "decide personal or shared" and `clearLocalSyncedData()`.
  - Auth: `isAdmin`, `data-admin-only`, the account-switch guard, and the rule that failure paths also reset `isAdmin`.
  - Notifications are per joined user, and TickTick uses `state`.
  - Resend's free tier (100 emails/day) is fine for a handful of users.
- **`docs/decisions.md`**: a "Multi-user, invite-only (2026-10)" entry covering why the admin comes from the env, why categories are shared, why invites reuse magic tokens, and the account-switch leak.
- **`docs/tasks.md`**: add the work to Done, and update the "Community sharing" note.

## Rollout order

All five phases are on `feature/multi-user`, so merging it to `main` deploys the backend (Render) and the frontend (Pages) together.
- If Pages goes live before Render has finished, the admin-only UI stays hidden: the old backend's `/auth/me` has no `isAdmin`, which the frontend reads as false. No data is at risk. Reload once Render is serving the new code. On its first boot the log shows "Moved the owner's categories into shared_data.", as long as you had categories saved.
- CI only runs on `main` and on pull requests, so merging through a PR gets CI on the whole branch first.
- Send the first real invite only after the checks below pass.

## Deliberately left out (to keep it simple)

- A roles table or promotion UI (there's one admin).
- Shared routine templates.
- Private R2 or signed photo URLs. Keys are unguessable UUID paths under each user's id, as today.
- Request-size limits or per-user rate limits. Invited users are trusted.
- Adopting a guest's local data on first sign-in.

## Verification

1. Using the portable Node (see the local-dev memory), run `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test` from `backend/`.
2. After deploying:
   1. `curl -s https://corolla.jhosan.top/api/health` returns OK.
   2. Sign in as admin. Products tab, Categories and Users are all visible, and the categories are unchanged (migrated).
   3. Invite a second address you control and open the link in a private window. It should be a fresh account on defaults, with no Products tab or Categories. Prices, Inventory and Checklist group products by your categories.
   4. As the invitee:
      - log a session with a photo;
      - set a price threshold;
      - optionally connect TickTick (this tests the OAuth `state`).

      Confirm the two accounts can't see each other's data.
   5. As admin, rename a product's slug. After a reload, the invitee's inventory and checklist entries follow it.
   6. Remove the invitee. Their next load shows signed-out, and their photos are gone from R2.
   7. After the next 07:00 and 08:00 UTC runs, the Render logs show reminder and digest lines per user.
