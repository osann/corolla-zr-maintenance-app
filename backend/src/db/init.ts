import { DatabaseSync } from 'node:sqlite';

const DDL = `
  CREATE TABLE IF NOT EXISTS products (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    slug       TEXT    NOT NULL UNIQUE,
    phase      INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS retailer_urls (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    retailer   TEXT    NOT NULL CHECK(retailer IN ('bowdens', 'supercheap', 'repco', 'autopro', 'autobarn')),
    url        TEXT    NOT NULL,
    UNIQUE(product_id, retailer)
  );

  CREATE TABLE IF NOT EXISTS price_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    retailer    TEXT    NOT NULL CHECK(retailer IN ('bowdens', 'supercheap', 'repco', 'autopro', 'autobarn')),
    price_cents INTEGER NOT NULL,
    on_sale     INTEGER NOT NULL DEFAULT 0,
    observed_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_price_product_time  ON price_history(product_id, observed_at);
  CREATE INDEX IF NOT EXISTS idx_price_retailer_time ON price_history(retailer, observed_at);
`;

export function initDb(dbPath = './db.sqlite') {
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec(DDL);
  sqlite.close();
}

// Allow running directly: npm run db:init
if (process.argv[1]?.endsWith('init.ts') || process.argv[1]?.endsWith('init.js')) {
  initDb();
  console.log('Database initialised: db.sqlite');
}
