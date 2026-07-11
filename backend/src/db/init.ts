import { createClient } from '@libsql/client';

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS products (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    slug       TEXT    NOT NULL UNIQUE,
    phase      INTEGER NOT NULL,
    is_pack    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  // retrofit the is_pack column onto a pre-existing products table (e.g. the live Render/Turso
  // DB). SQLite's ALTER TABLE ADD COLUMN has no IF NOT EXISTS clause and errors if run twice,
  // so check first.
  const cols = await client.execute(`PRAGMA table_info(products)`);
  const hasIsPack = cols.rows.some((r) => r.name === 'is_pack');
  if (!hasIsPack) {
    await client.execute(`ALTER TABLE products ADD COLUMN is_pack INTEGER NOT NULL DEFAULT 0`);
  }

  await client.close();
}

// Allow running directly: npm run db:init
if (process.argv[1]?.endsWith('init.ts') || process.argv[1]?.endsWith('init.js')) {
  await initDb();
  console.log('Database initialised.');
}
