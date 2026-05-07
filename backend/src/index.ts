import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import cron from 'node-cron';
import productsRouter from './routes/products.js';
import alertsRouter from './routes/alerts.js';
import pricesRouter from './routes/prices.js';
import { scrapeAllRetailers } from './scrapers/index.js';
import { scrapeAutobarn } from './scrapers/autobarn.js';
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

// Daily backup scrape for Auto Barn, Supercheap, and Repco at 23:00 UTC (9 AM AEST).
// GitHub Actions is the primary path for Supercheap and Repco; this is a safety net.
// Bowden's Own blocks all datacenter IPs — not scraped.
cron.schedule('0 23 * * *', () => {
  console.log('Running scheduled Bowden\'s scrape...');
  scrapeAllRetailers().catch(console.error);
});

// Auto Barn + Autopro: daily at 05:00 UTC — within both sites' robots.txt window (04:00–08:45 UTC).
// GitHub Actions free tier can delay scheduled runs by hours, pushing execution outside
// the allowed window. Render node-cron fires punctually, so this is the reliable path.
// Both sites block GitHub Actions IPs at the network level.
cron.schedule('0 5 * * *', () => {
  console.log('Running scheduled Auto Barn scrape...');
  scrapeAutobarn().catch(console.error);
  console.log('Running scheduled Autopro scrape...');
  scrapeAutopro().catch(console.error);
});

const port = Number(process.env.PORT ?? 3000);
console.log(`Server running on port ${port}`);

serve({ fetch: app.fetch, port });
