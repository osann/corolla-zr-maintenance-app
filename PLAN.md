# Plan: Multi-device sync

## Context

The app is a single-user personal tool currently storing all data in localStorage. Task 4 in TASKS.md is to allow the owner to access their data (checklist state, wash log, budget, settings) from multiple devices. The mechanism is magic-link email auth (no passwords) + a server-side key-value store for the four existing storage keys. Auth is optional — the app continues to work fully offline without signing in.

---

## Architecture

```
Device 1 (laptop)                   Render backend                Device 2 (phone)
─────────────────                   ──────────────                ──────────────────
  localStorage  ◄──── storageSet    /api/sync/:key  ────────────► localStorage
  (always)       ──── syncPush ──► (Turso DB)       ◄─ pullSync ─  (on login)
```

- `storageGet`/`storageSet` remain unchanged — localStorage is always the primary layer
- `syncPush(key, val)` is a fire-and-forget call appended after every `storageSet`
- On login, remote data overwrites local (remote is source of truth for authenticated users)
- Token exchange: magic link → `?token=xxx` in URL → frontend POSTs to `/api/auth/verify` → session cookie set → URL cleaned immediately

---

## New dependencies

```bash
cd backend && npm install resend
```

Only one new production dependency. All crypto uses Node 22 built-ins (`node:crypto`).

---

## New environment variables (Render dashboard)

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | From Resend dashboard |
| `RESEND_FROM` | `Corolla Detailing <sync@corolla.jhosan.top>` (must be verified domain in Resend) |
| `OWNER_EMAIL` | `joh.10@pm.me` — requests for any other email are silently accepted but no email sent |
| `APP_URL` | `https://corolla.jhosan.top` |

---

## Step 1 — DB schema (`backend/src/db/schema.ts`)

Append four new tables after the existing `priceHistory` table:

```ts
export const users = sqliteTable('users', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  email:     text('email').notNull().unique(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const magicTokens = sqliteTable('magic_tokens', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  tokenHash: text('token_hash').notNull().unique(), // SHA-256 of raw token — raw token never stored
  userId:    integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),          // ISO-8601, 15 min from creation
  usedAt:    text('used_at'),                       // null = unused; set on first verification
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('idx_magic_token_hash').on(t.tokenHash),
]);

export const sessions = sqliteTable('sessions', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().unique(), // 32 random bytes as hex; stored plaintext
  userId:    integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),          // ISO-8601, 30 days from creation
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('idx_session_id').on(t.sessionId),
]);

export const userData = sqliteTable('user_data', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  userId:    integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  key:       text('key').notNull(),
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  uniqueIndex('idx_user_data_key').on(t.userId, t.key),
]);

export type User     = typeof users.$inferSelect;
export type Session  = typeof sessions.$inferSelect;
export type UserData = typeof userData.$inferSelect;
```

**Security note:** `sessionId` is stored plaintext because it only travels over httpOnly cookies (never exposed to JS or URL). The magic link token is SHA-256 hashed because it travels via email and URL, which may appear in logs or browser history.

---

## Step 2 — DB init (`backend/src/db/init.ts`)

Append to the `DDL_STATEMENTS` array (same pattern as existing entries):

```ts
`CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL UNIQUE,
  created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
`CREATE TABLE IF NOT EXISTS magic_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash  TEXT    NOT NULL UNIQUE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT    NOT NULL,
  used_at     TEXT,
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
`CREATE INDEX IF NOT EXISTS idx_magic_token_hash ON magic_tokens(token_hash)`,
`CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT    NOT NULL UNIQUE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
`CREATE INDEX IF NOT EXISTS idx_session_id ON sessions(session_id)`,
`CREATE TABLE IF NOT EXISTS user_data (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         TEXT    NOT NULL,
  value_json  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, key)
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_data_key ON user_data(user_id, key)`,
```

---

## Step 3 — `backend/src/lib/auth.ts` (new file)

Crypto helpers + session middleware. Exports used by the auth router:

```ts
import { createHash, randomBytes } from 'node:crypto';
import type { Context, Next } from 'hono';
import { db } from '../db/connection.js';
import { sessions } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const generateToken  = () => randomBytes(32).toString('hex');
export const hashToken      = (raw: string) => createHash('sha256').update(raw).digest('hex');
export const tokenExpiresAt = (mins = 15) =>
  new Date(Date.now() + mins * 60_000).toISOString();
export const sessionExpiresAt = (days = 30) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

// Attaches c.var.userId (number | null) — routes decide whether to 401
export async function sessionMiddleware(c: Context, next: Next) {
  c.set('userId', null);
  const cookieHeader = c.req.header('cookie') ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  const sessionId = match?.[1] ?? null;

  if (sessionId) {
    const rows = await db
      .select({ userId: sessions.userId, expiresAt: sessions.expiresAt })
      .from(sessions).where(eq(sessions.sessionId, sessionId)).limit(1);

    if (rows.length > 0 && new Date(rows[0].expiresAt) > new Date()) {
      c.set('userId', rows[0].userId);
    }
  }
  await next();
}
```

---

## Step 4 — `backend/src/lib/email.ts` (new file)

```ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendMagicLink(to: string, token: string): Promise<void> {
  const appUrl = process.env.APP_URL ?? 'https://corolla.jhosan.top';
  const link   = `${appUrl}?token=${token}`;
  await resend.emails.send({
    from:    process.env.RESEND_FROM ?? 'Corolla Detailing <sync@corolla.jhosan.top>',
    to,
    subject: 'Sign in to Corolla Detailing',
    html:    `<p>Your sign-in link (expires in 15 minutes, one-time use):</p><p><a href="${link}">Sign in →</a></p><p style="color:#888;font-size:13px">If you didn't request this, ignore it.</p>`,
    text:    `Sign in: ${link}\n\nExpires in 15 minutes. If you didn't request this, ignore it.`,
  });
}
```

---

## Step 5 — `backend/src/routes/auth.ts` (new file)

Six routes on a single Hono router, mounted at `/api`:

| Route | Purpose |
|---|---|
| `POST /api/auth/request` | Validate owner email, generate token, send magic link |
| `POST /api/auth/verify` | Hash + verify token, mark used, create session, set cookie |
| `POST /api/auth/logout` | Delete session row, clear cookie |
| `GET /api/auth/me` | Return `{ authenticated, email }` for current session |
| `GET /api/sync` | Return all stored keys for authenticated user |
| `POST /api/sync/:key` | Upsert one key for authenticated user |

**Key implementation details:**

`POST /api/auth/request`:
- In-memory `Map<string, number>` for 60s per-email cooldown (resets on Render restart, acceptable)
- Non-owner emails: silently return `{ ok: true }` — prevents email enumeration
- Invalidate any existing unused tokens for the user before creating a new one
- Raw token passed only to `sendMagicLink()` — never logged

`POST /api/auth/verify`:
- Hash the received token, look up in DB
- Three rejection conditions checked in order: not found, already used (`usedAt` not null), expired
- Mark as used before creating session (prevents race conditions on double-click)
- Cookie: `HttpOnly; Secure; SameSite=None; Max-Age=<30 days>; Path=/`
- `SameSite=None` is required because the frontend (`corolla.jhosan.top`) and backend (`*.onrender.com`) are different origins

`POST /api/sync/:key`:
- Allowlist: only the four known storage keys are accepted, 400 otherwise
- Upsert via Drizzle's `.insert().onConflictDoUpdate({ target: [userData.userId, userData.key], set: { valueJson, updatedAt } })`

`POST /api/auth/request` and `POST /api/auth/verify` do not require a session — they are the unauthenticated auth endpoints. All sync routes and `/auth/me` use `sessionMiddleware`.

---

## Step 6 — `backend/src/index.ts`

Two changes:

**CORS** — add `credentials: true` and `allowHeaders`:
```ts
app.use('*', cors({
  origin: ['https://osann.github.io', 'https://corolla.jhosan.top'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  credentials: true,  // required for Set-Cookie cross-origin
}));
```

**Route registration** — add after the existing three route imports/mounts:
```ts
import authRouter from './routes/auth.js';
// ...
app.route('/api', authRouter);
```

---

## Step 7 — `app.js`

### 7a. New state variables (after `BACKEND_URL` line)
```js
let syncEnabled = false;
let syncEmail   = null;
```

### 7b. `syncPush(key, value)` — add after `storageSet` function
```js
async function syncPush(key, value) {
  if (!syncEnabled || !BACKEND_URL || BACKEND_URL.startsWith('__')) return;
  try {
    await fetch(`${BACKEND_URL}/api/sync/${encodeURIComponent(key)}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
      signal: AbortSignal.timeout(8000),
    });
  } catch {}
}
```

### 7c. Add `syncPush` after every `storageSet(SETTINGS_KEY/CHECKLIST_KEY/LOG_KEY/BUDGET_KEY)`

Exact locations (all are one-liners appended after the existing `storageSet` call):

| Function | Line | Call to append |
|---|---|---|
| `saveChecklist()` | after line 56 | `syncPush(CHECKLIST_KEY, state);` |
| `saveLog()` | after line ~229 | `syncPush(LOG_KEY, washLog);` |
| `saveBudget()` | after line 116 | `syncPush(BUDGET_KEY, { target: val });` |
| `saveSettings()` | after line 633 | `syncPush(SETTINGS_KEY, settings);` |
| `resetFreq()` | after line 676 | `syncPush(SETTINGS_KEY, settings);` |
| `resetRoutines()` | after line 686 | `syncPush(SETTINGS_KEY, settings);` |
| `resetPrefs()` | after line 695 | `syncPush(SETTINGS_KEY, settings);` |

**`resetEverything()` edge case:** This function clears all local storage then calls `location.reload()`. Without handling, the reload would trigger `checkAuthAndSync()` which would pull remote data and undo the reset. Fix: call `signOut()` (which disables sync) before the `storageSet` clears, or push empty values for all four keys to remote as well. Preferred: push empty/default values to remote so both devices are cleared.

### 7d. `checkAuthAndSync()` — add before `init()`

Sequence:
1. Check for `?token=` in URL → clean URL immediately → POST to `/api/auth/verify`
2. Call `GET /api/auth/me` to check for existing session
3. If authenticated: set `syncEnabled = true`, call `renderAuthUI()`, pull all keys from `GET /api/sync`, overwrite localStorage with remote values, re-run all `loadXxx()` functions

If the backend is unreachable, fall through silently — app stays in offline mode.

### 7e. Update `init()`
```js
async function init() {
  await loadChecklist();
  await loadLog();
  await loadBudget();
  await loadSettings();
  await checkAuthAndSync();   // may overwrite local state and re-run load* functions
  loadPriceData();
}
```

### 7f. Auth UI helpers
Four functions: `renderAuthUI()`, `setAuthStatus(msg)`, `requestMagicLink()`, `signOut()`.
- `renderAuthUI()` toggles between signed-in and signed-out state using element IDs from Step 8
- `requestMagicLink()` POSTs to `/api/auth/request`, handles 429 cooldown response
- `signOut()` POSTs to `/api/auth/logout`, sets `syncEnabled = false`, calls `renderAuthUI()`

---

## Step 8 — `index.html`

Insert a new `<div class="settings-section">` as the **first child** of `<div class="panel" id="settings">` (before line 1388 "Wash Frequency"):

```html
<div class="settings-section">
  <div class="settings-section-title">Device sync</div>
  <div class="settings-section-desc" id="auth-status-text">Not signed in — data is local only</div>

  <div id="auth-login-form">
    <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:10px;">
      <div class="settings-row-label">
        <strong>Sign in with your email</strong>
        <span>A one-time link will be emailed to you. After clicking it, data syncs automatically across devices.</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input class="log-input" type="email" id="auth-email-input"
          placeholder="your@email.com" style="flex:1;min-width:200px;"
          onkeydown="if(event.key==='Enter') requestMagicLink()">
        <button class="settings-save-btn" id="auth-send-btn" onclick="requestMagicLink()">Send link</button>
      </div>
    </div>
    <div id="auth-message" class="settings-saved-msg" style="display:none;visibility:visible;opacity:1;padding:8px 0;"></div>
  </div>

  <div id="auth-logout-section" style="display:none;">
    <div class="settings-row">
      <div class="settings-row-label">
        <strong>Signed in as</strong>
        <span id="auth-email-display"></span>
      </div>
      <div class="settings-control">
        <button class="settings-reset-btn" onclick="signOut()">Sign out</button>
      </div>
    </div>
  </div>
</div>
```

Reuses only existing CSS classes — no new CSS rules needed.

---

## Files modified

| File | Change |
|---|---|
| `backend/src/db/schema.ts` | Add 4 tables + type exports |
| `backend/src/db/init.ts` | Add DDL for 4 tables + indexes |
| `backend/src/lib/auth.ts` | **New** — crypto helpers + session middleware |
| `backend/src/lib/email.ts` | **New** — Resend wrapper |
| `backend/src/routes/auth.ts` | **New** — 6 routes (auth + sync) |
| `backend/src/index.ts` | CORS credentials, mount auth router |
| `app.js` | Sync state, `syncPush`, patch 7 save functions, `checkAuthAndSync`, auth helpers |
| `index.html` | Add device sync section to Settings panel |
| `backend/package.json` | `resend` dependency |

---

## Verification checklist

**Backend (local `npm run dev`):**
- [ ] `npm run db:init` creates all new tables without error
- [ ] `POST /api/auth/request` with owner email → email arrives, link contains `?token=`
- [ ] `POST /api/auth/request` with wrong email → returns `{ ok: true }`, no email sent
- [ ] Second request within 60s → HTTP 429
- [ ] `POST /api/auth/verify` with raw token → HTTP 200, `Set-Cookie` header with `HttpOnly; Secure; SameSite=None`
- [ ] Same verify request again → HTTP 401 `Token already used`
- [ ] Token > 15 min old → HTTP 401 `Token expired`
- [ ] `GET /api/auth/me` with cookie → `{ authenticated: true, email: "..." }`
- [ ] `GET /api/auth/me` without cookie → `{ authenticated: false }`
- [ ] `POST /api/sync/corolla-washlog-v1` with session → `{ ok: true }`
- [ ] `POST /api/sync/unknown-key` → HTTP 400
- [ ] `POST /api/sync/...` without session → HTTP 401
- [ ] `GET /api/sync` returns previously pushed key
- [ ] `POST /api/auth/logout` → session row deleted, `Max-Age=0` cookie returned
- [ ] All existing routes (`/api/products`, `/api/alerts`, `/api/prices`) unaffected

**CORS (browser DevTools):**
- [ ] Response includes `Access-Control-Allow-Credentials: true`
- [ ] Session cookie has `HttpOnly`, `Secure`, `SameSite=None` flags in Application tab

**Frontend:**
- [ ] App loads and works fully with no backend connection
- [ ] Settings tab shows "Not signed in" auth section on first load
- [ ] Entering email + clicking Send shows "Check your email" message and disables button
- [ ] Clicking magic link: URL cleaned instantly, Settings shows signed-in state with email
- [ ] Mutations (check item, log wash, change setting) each fire `POST /api/sync/<key>` visible in Network tab
- [ ] On second device: sign in with same email → local state replaced with device 1's data
- [ ] Sign out → auth section returns to form, no further sync requests in Network tab
- [ ] `resetEverything()` clears both local and remote data correctly