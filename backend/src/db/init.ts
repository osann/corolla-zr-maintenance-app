import { createClient } from '@libsql/client';
import { isRetailer, isRetailerUrl, RETAILER_HOSTS } from './schema.js';

export const RETIRED_RETAILERS = ['repco', 'autopro', 'bowdens'] as const;

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS products (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    name                    TEXT    NOT NULL UNIQUE,
    slug                    TEXT    NOT NULL UNIQUE,
    phase                   INTEGER NOT NULL,
    is_pack                 INTEGER NOT NULL DEFAULT 0,
    default_volume_ml       INTEGER,
    default_usage_per_wash_ml INTEGER,
    created_at              TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS retailer_urls (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    retailer   TEXT    NOT NULL CHECK(retailer IN ('bowdens', 'supercheap', 'repco', 'autopro', 'autobarn')),
    url        TEXT    NOT NULL,
    UNIQUE(product_id, retailer)
  )`,
  `CREATE TABLE IF NOT EXISTS price_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    retailer    TEXT    NOT NULL CHECK(retailer IN ('bowdens', 'supercheap', 'repco', 'autopro', 'autobarn')),
    price_cents INTEGER NOT NULL,
    on_sale     INTEGER NOT NULL DEFAULT 0,
    observed_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_price_product_time ON price_history(product_id, observed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_price_retailer_time ON price_history(retailer, observed_at)`,
  `CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    joined_at  TEXT
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
  `CREATE TABLE IF NOT EXISTS shared_data (
    key         TEXT PRIMARY KEY,
    value_json  TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS photos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    log_entry_id INTEGER NOT NULL,
    r2_key       TEXT    NOT NULL,
    thumb_key    TEXT    NOT NULL,
    mime_type    TEXT    NOT NULL,
    size_bytes   INTEGER NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_photos_user_entry ON photos(user_id, log_entry_id)`,
  `CREATE TABLE IF NOT EXISTS pack_components (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_product_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    component_product_id  INTEGER REFERENCES products(id) ON DELETE CASCADE,
    name                  TEXT    NOT NULL,
    volume_ml             INTEGER,
    is_equipment          INTEGER NOT NULL DEFAULT 0,
    section_category      TEXT,
    section_label         TEXT,
    sort_order            INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pack_components_pack ON pack_components(pack_product_id)`,
  `CREATE TABLE IF NOT EXISTS deleted_products (
    slug       TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];

export async function initDb() {
  const client = createClient({
    url: process.env.TURSO_URL ?? 'file:./db.sqlite',
    authToken: process.env.TURSO_TOKEN,
  });
  for (const sql of DDL_STATEMENTS) {
    await client.execute(sql);
  }

  // `CREATE TABLE IF NOT EXISTS` is a no-op against an already-existing table, so it won't
  // retrofit new columns onto a pre-existing table (e.g. the live Render/Turso DB).
  // SQLite's ALTER TABLE ADD COLUMN has no IF NOT EXISTS clause and errors if run twice, so
  // check first. `backfill` runs only on the boot that adds the column.
  const columnsToAdd: { table: string; name: string; ddl: string; backfill?: string }[] = [
    { table: 'products', name: 'is_pack', ddl: 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'products', name: 'default_volume_ml', ddl: 'INTEGER' },
    { table: 'products', name: 'default_usage_per_wash_ml', ddl: 'INTEGER' },
    // Every account from before invites existed has already signed in, so it counts as joined.
    {
      table: 'users',
      name: 'joined_at',
      ddl: 'TEXT',
      backfill: `UPDATE users SET joined_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at)`,
    },
  ];
  const existingCols = new Map<string, Set<unknown>>();
  for (const { table, name, ddl, backfill } of columnsToAdd) {
    if (!existingCols.has(table)) {
      const cols = await client.execute(`PRAGMA table_info(${table})`);
      existingCols.set(table, new Set(cols.rows.map((r) => r.name)));
    }
    if (!existingCols.get(table)!.has(name)) {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
      if (backfill) await client.execute(backfill);
    }
  }

  // Product categories became shared, admin-edited data. Move the owner's copy from user_data
  // into shared_data once; after that shared_data already has the row and this does nothing.
  // The scraper runners have no OWNER_EMAIL, so they skip it.
  const ownerEmail = (process.env.OWNER_EMAIL ?? '').trim().toLowerCase();
  if (ownerEmail) {
    const ownerRow = `SELECT ud.key, ud.value_json, ud.updated_at FROM user_data ud JOIN users u ON u.id = ud.user_id
      WHERE lower(u.email) = ? AND ud.key = 'corolla-categories-v1'`;
    const moved = await client.execute({
      sql: `INSERT INTO shared_data (key, value_json, updated_at) ${ownerRow}
        AND NOT EXISTS (SELECT 1 FROM shared_data WHERE key = 'corolla-categories-v1')`,
      args: [ownerEmail],
    });
    if (moved.rowsAffected) {
      await client.execute({
        sql: `DELETE FROM user_data WHERE key = 'corolla-categories-v1'
          AND user_id IN (SELECT id FROM users WHERE lower(email) = ?)`,
        args: [ownerEmail],
      });
      console.log("Moved the owner's categories into shared_data.");
    }
  }

  // Retired retailers (bot-blocked; see docs/blocked-retailers.md): remove their URLs and price
  // history on every boot, so stale or re-added rows can't come back. The CHECK constraints
  // above still allow them, so re-enabling one only means removing it from this list.
  const placeholders = RETIRED_RETAILERS.map(() => '?').join(', ');
  for (const table of ['price_history', 'retailer_urls']) {
    const res = await client.execute({
      sql: `DELETE FROM ${table} WHERE retailer IN (${placeholders})`,
      args: [...RETIRED_RETAILERS],
    });
    if (res.rowsAffected) console.log(`Removed ${res.rowsAffected} ${table} rows for retired retailers.`);
  }

  // URLs on the wrong retailer's site never get a price (see isRetailerUrl in schema.ts). The
  // product routes reject them now; this clears any saved before that.
  const { rows: urlRows } = await client.execute('SELECT id, retailer, url FROM retailer_urls');
  for (const { id, retailer, url } of urlRows) {
    if (isRetailer(retailer) && !isRetailerUrl(retailer, String(url))) {
      await client.execute({ sql: 'DELETE FROM retailer_urls WHERE id = ?', args: [id] });
      console.log(`Removed a ${retailer} URL that isn't on ${RETAILER_HOSTS[retailer]}: ${url}`);
    }
  }

  await client.close();
}

// Allow running directly: npm run db:init
if (process.argv[1]?.endsWith('init.ts') || process.argv[1]?.endsWith('init.js')) {
  await initDb();
  console.log('Database initialised.');
}
