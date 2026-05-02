import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import cron from 'node-cron';
import productsRouter from './routes/products.js';
import alertsRouter from './routes/alerts.js';
import { scrapeAll } from './scrapers/bowdens.js';
import { initDb } from './db/init.js';
import { seed } from './db/seed.js';

// Ensure schema and seed data exist on every startup (idempotent).
// Handles first boot on a fresh Render deploy where the SQLite file doesn't exist yet.
initDb();
await seed();

const app = new Hono();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:5500'];

app.use('*', cors({ origin: (origin) => allowedOrigins.includes(origin) ? origin : allowedOrigins[0] }));

app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

app.route('/api', productsRouter);
app.route('/api', alertsRouter);

// Scrape trigger — called by GitHub Actions cron (more reliable than node-cron on free hosting)
let scraping = false;
app.post('/api/scrape', async (c) => {
  if (scraping) return c.json({ status: 'already running' }, 409);
  scraping = true;
  scrapeAll()
    .catch(console.error)
    .finally(() => { scraping = false; });
  return c.json({ status: 'started' });
});

// Fallback: also schedule via node-cron in case the server stays warm
cron.schedule('0 9 * * *', () => {
  console.log('Running scheduled scrape...');
  scrapeAll().catch(console.error);
});

const port = Number(process.env.PORT ?? 3000);
console.log(`Server running on port ${port}`);

serve({ fetch: app.fetch, port });
