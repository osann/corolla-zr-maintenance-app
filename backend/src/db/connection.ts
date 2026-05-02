import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema.js';

const sqlite = new DatabaseSync('./db.sqlite');

export const db = drizzle(
  (sql, params, method) => {
    const stmt = sqlite.prepare(sql);
    if (method === 'run') {
      stmt.run(...(params as unknown[]));
      return { rows: [] };
    }
    if (method === 'get') {
      const row = stmt.get(...(params as unknown[])) as Record<string, unknown> | undefined;
      return { rows: row ? [Object.values(row)] : [] };
    }
    const rows = stmt.all(...(params as unknown[])) as Record<string, unknown>[];
    return { rows: rows.map(r => Object.values(r)) };
  },
  { schema },
);
