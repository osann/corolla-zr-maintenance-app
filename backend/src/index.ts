import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import cron from 'node-cron';
import productsRouter from './routes/products.js';
import alertsRouter from './routes/alerts.js';
import pricesRouter from './routes/prices.js';
import { scrapeAllRetailers } from './scrapers/index.js';
import { initDb } from './db/init.js';
import { seed } from './db/seed.js';

// Ensure schema and seed data exist on every startup (idempotent).
// Handles first boot on a fresh Render deploy where the SQLite file doesn't exist yet.
initDb();
await seed();

const app = new Hono();

app.use('*', cors({
  origin: ['https://osann.github.io'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}));

app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

app.route('/api', productsRouter);
app.route('/api', alertsRouter);
app.route('/api', pricesRouter);

// node-cron fallback: runs Bowden's Own scraper daily at 9 AM AEST (23:00 UTC).
// Auto Barn, Repco, and Supercheap are scraped by GitHub Actions (run-and-push.ts)
// since those scrapers need Playwright which can't run on Render's free tier.
cron.schedule('0 23 * * *', () => {
  console.log('Running scheduled Bowden\'s scrape...');
  scrapeAllRetailers().catch(console.error);
});

const port = Number(process.env.PORT ?? 3000);
console.log(`Server running on port ${port}`);

serve({ fetch: app.fetch, port });
