import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

const client = createClient({
  url: process.env.TURSO_URL ?? 'file:./db.sqlite',
  authToken: process.env.TURSO_TOKEN,
});

export const db = drizzle(client, { schema });
