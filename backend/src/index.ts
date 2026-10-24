import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import cron from 'node-cron';
import productsRouter from './routes/products.js';
import alertsRouter from './routes/alerts.js';
import pricesRouter from './routes/prices.js';
import authRouter from './routes/auth.js';
import weatherRouter from './routes/weather.js';
import photosRouter from './routes/photos.js';
import ticktickRouter from './routes/ticktick.js';
import { initDb } from './db/init.js';
import { seed, seedPacks } from './db/seed.js';
import { runWashReminders, runDailyDigest } from './lib/notifications.js';

// Ensure schema and seed data exist on every startup (idempotent).
// Wrapped in try/catch so a transient Turso 502 on startup doesn't prevent the server
// from binding — npm start already runs init+seed as separate steps before this file.
try {
  await initDb();
  await seed();
  await seedPacks();
} catch (e) {
  console.error('Startup init/seed failed (continuing):', e);
}

if (!process.env.OWNER_EMAIL) {
  console.error('OWNER_EMAIL is not set — there is no admin account.');
}

const app = new Hono();

app.use(
  '*',
  cors({
    origin: ['https://osann.github.io', 'https://corolla.jhosan.top'],
    allowMethods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    credentials: true,
  }),
);

app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

app.route('/api', productsRouter);
app.route('/api', alertsRouter);
app.route('/api', pricesRouter);
app.route('/api', authRouter);
app.route('/api', weatherRouter);
app.route('/api', photosRouter);
app.route('/api', ticktickRouter);

// No scraping runs on Render: Supercheap and Auto Barn are scraped from GitHub Actions and the
// self-hosted runner. See docs/blocked-retailers.md for the retired Autopro cron.

// Both jobs run for every user who has signed in (see lib/notifications.ts). They catch per-user
// errors themselves; the .catch here covers anything else, since an unhandled rejection would
// crash Node.

// Wash reminders: daily at 07:00 UTC, per settings.schedules.
cron.schedule('0 7 * * *', () => runWashReminders().catch((err) => console.error('Wash reminder cron error:', err)));

// Daily price digest: 08:00 UTC (after the wash reminder).
cron.schedule('0 8 * * *', () => runDailyDigest().catch((err) => console.error('Digest cron error:', err)));

const port = Number(process.env.PORT ?? 3000);
console.log(`Server running on port ${port}`);

serve({ fetch: app.fetch, port });
