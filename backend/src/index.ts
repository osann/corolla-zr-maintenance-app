import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import cron from 'node-cron';
import productsRouter from './routes/products.js';
import alertsRouter from './routes/alerts.js';
import pricesRouter from './routes/prices.js';
import authRouter from './routes/auth.js';
import weatherRouter from './routes/weather.js';
import { scrapeAutopro } from './scrapers/autopro.js';
import { initDb } from './db/init.js';
import { seed } from './db/seed.js';
import { db } from './db/connection.js';
import { users, userData } from './db/schema.js';
import { and, eq } from 'drizzle-orm';
import { sendTickTickTask, sendDirectEmail, getOwnerNotificationSettings } from './lib/email.js';

// Ensure schema and seed data exist on every startup (idempotent).
// Handles first boot on a fresh Render deploy where the SQLite file doesn't exist yet.
await initDb();
await seed();

const app = new Hono();

app.use('*', cors({
  origin: ['https://osann.github.io', 'https://corolla.jhosan.top'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  credentials: true,
}));

app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

app.route('/api', productsRouter);
app.route('/api', alertsRouter);
app.route('/api', pricesRouter);
app.route('/api', authRouter);
app.route('/api', weatherRouter);

// Autopro: daily at 05:00 UTC — within robots.txt crawl window (04:00–08:45 UTC).
// Render node-cron fires punctually; GitHub Actions scheduled runs can be delayed.
// Auto Barn uses the same platform/SKUs as Autopro but blocks Render IPs (HTTP 403).
// Repco and Supercheap use Playwright (not installed at runtime) — handled by GitHub Actions.
cron.schedule('0 5 * * *', () => {
  console.log('Running scheduled Autopro scrape...');
  scrapeAutopro().catch(console.error);
});

// Wash reminder: daily at 07:00 UTC (after Autopro scrape window closes).
cron.schedule('0 7 * * *', async () => {
  const ownerEmail = process.env.OWNER_EMAIL ?? 'joh.10@pm.me';
  const notifSettings = await getOwnerNotificationSettings(ownerEmail);
  const canSendWash = (notifSettings.washReminders && !!notifSettings.ticktickEmail) || notifSettings.emailWashReminders;
  if (!canSendWash) return;

  try {
    const userRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, ownerEmail))
      .limit(1);

    if (userRows.length === 0) return;
    const userId = userRows[0].id;

    const [logRow, settingsRow] = await Promise.all([
      db.select({ valueJson: userData.valueJson })
        .from(userData)
        .where(and(eq(userData.userId, userId), eq(userData.key, 'corolla-washlog-v1')))
        .limit(1),
      db.select({ valueJson: userData.valueJson })
        .from(userData)
        .where(and(eq(userData.userId, userId), eq(userData.key, 'corolla-settings-v1')))
        .limit(1),
    ]);

    if (logRow.length === 0) return;

    type WashEntry = { date: string };
    const washLog: WashEntry[] = JSON.parse(logRow[0].valueJson);
    if (!Array.isArray(washLog) || washLog.length === 0) return;

    const lastDate = new Date(
      [...washLog].sort((a, b) => b.date.localeCompare(a.date))[0].date
    );

    const intervalDays = (() => {
      if (settingsRow.length === 0) return 14;
      const freq = JSON.parse(settingsRow[0].valueJson)?.freq?.fullWash;
      return typeof freq === 'number' && freq > 0 ? freq : 14;
    })();

    const dueDate = new Date(lastDate);
    dueDate.setDate(dueDate.getDate() + intervalDays);

    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);

    if (todayUtc < dueDate) return;

    const overdueDays = Math.floor((todayUtc.getTime() - dueDate.getTime()) / 86_400_000);
    const lastDateStr = lastDate.toISOString().slice(0, 10);

    const washBody = overdueDays > 0
      ? `Last wash: ${lastDateStr}\nOverdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'} (every ${intervalDays} days)`
      : `Last wash: ${lastDateStr}\nDue today (every ${intervalDays} days)`;

    if (notifSettings.washReminders && notifSettings.ticktickEmail) {
      await sendTickTickTask(
        notifSettings.ticktickEmail,
        '🚗 Corolla wash due ^Car #Corolla today !Medium',
        washBody,
      );
    }
    if (notifSettings.emailWashReminders) {
      await sendDirectEmail(ownerEmail, '🚗 Corolla wash due', washBody);
    }

    console.log(`Wash reminder sent — last wash: ${lastDateStr}, overdue: ${overdueDays}d`);
  } catch (err) {
    console.error('Wash reminder cron error:', err);
  }
});

const port = Number(process.env.PORT ?? 3000);
console.log(`Server running on port ${port}`);

serve({ fetch: app.fetch, port });
