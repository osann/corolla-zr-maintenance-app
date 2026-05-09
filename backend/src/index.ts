import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import cron from 'node-cron';
import productsRouter from './routes/products.js';
import alertsRouter from './routes/alerts.js';
import pricesRouter from './routes/prices.js';
import { scrapeAutopro } from './scrapers/autopro.js';
import { initDb } from './db/init.js';
import { seed } from './db/seed.js';

// Ensure schema and seed data exist on every startup (idempotent).
// Handles first boot on a fresh Render deploy where the SQLite file doesn't exist yet.
await initDb();
await seed();

const app = new Hono();

app.use('*', cors({
  origin: ['https://osann.github.io', 'https://corolla.jhosan.top'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}));

app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

app.route('/api', productsRouter);
app.route('/api', alertsRouter);
app.route('/api', pricesRouter);

// Autopro: daily at 05:00 UTC — within robots.txt crawl window (04:00–08:45 UTC).
// Render node-cron fires punctually; GitHub Actions scheduled runs can be delayed.
// Auto Barn uses the same platform/SKUs as Autopro but blocks Render IPs (HTTP 403).
// Repco and Supercheap use Playwright (not installed at runtime) — handled by GitHub Actions.
cron.schedule('0 5 * * *', () => {
  console.log('Running scheduled Autopro scrape...');
  scrapeAutopro().catch(console.error);
});

const port = Number(process.env.PORT ?? 3000);
console.log(`Server running on port ${port}`);

serve({ fetch: app.fetch, port });
