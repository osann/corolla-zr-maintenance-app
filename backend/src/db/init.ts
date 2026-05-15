import { createClient } from '@libsql/client';

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS products (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    slug       TEXT    NOT NULL UNIQUE,
    phase      INTEGER NOT NULL,
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
];

export async function initDb() {
  const client = createClient({
    url: process.env.TURSO_URL ?? 'file:./db.sqlite',
    authToken: process.env.TURSO_TOKEN,
  });
  for (const sql of DDL_STATEMENTS) {
    await client.execute(sql);
  }
  await client.close();
}

// Allow running directly: npm run db:init
if (process.argv[1]?.endsWith('init.ts') || process.argv[1]?.endsWith('init.js')) {
  await initDb();
  console.log('Database initialised.');
}
