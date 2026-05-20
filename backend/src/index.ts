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
import { scrapeAutopro } from './scrapers/autopro.js';
import { createTickTickTask, computeDueDate } from './lib/ticktick.js';
import { initDb } from './db/init.js';
import { seed } from './db/seed.js';
import { db } from './db/connection.js';
import { users, userData, products, priceHistory } from './db/schema.js';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  sendDirectEmail, sendDigestEmail,
  getOwnerNotificationSettings, getOwnerAlertThresholds,
  type DigestThresholdItem,
} from './lib/email.js';

// Ensure schema and seed data exist on every startup (idempotent).
// Handles first boot on a fresh Render deploy where the SQLite file doesn't exist yet.
await initDb();
await seed();

const app = new Hono();

app.use('*', cors({
  origin: ['https://osann.github.io', 'https://corolla.jhosan.top'],
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  credentials: true,
}));

app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

app.route('/api', productsRouter);
app.route('/api', alertsRouter);
app.route('/api', pricesRouter);
app.route('/api', authRouter);
app.route('/api', weatherRouter);
app.route('/api', photosRouter);
app.route('/api', ticktickRouter);

// Autopro: daily at 05:00 UTC — within robots.txt crawl window (04:00–08:45 UTC).
// Render node-cron fires punctually; GitHub Actions scheduled runs can be delayed.
// Auto Barn uses the same platform/SKUs as Autopro but blocks Render IPs (HTTP 403).
// Repco and Supercheap use Playwright (not installed at runtime) — handled by GitHub Actions.
cron.schedule('0 5 * * *', () => {
  console.log('Running scheduled Autopro scrape...');
  scrapeAutopro().catch(console.error);
});

// Wash reminder: daily at 07:00 UTC (after Autopro scrape window closes).
// Iterates settings.schedules; falls back to legacy fullWash check if no schedules configured.
cron.schedule('0 7 * * *', async () => {
  const ownerEmail = process.env.OWNER_EMAIL ?? 'joh.10@pm.me';
  const notifSettings = await getOwnerNotificationSettings(ownerEmail);
  const canSendWash = (notifSettings.washReminders && notifSettings.ticktickConnected) || notifSettings.emailWashReminders;
  if (!canSendWash) return;

  try {
    const userRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, ownerEmail))
      .limit(1);

    if (userRows.length === 0) return;
    const userId = userRows[0].id;

    const [logRow, settingsRow, routinesRow] = await Promise.all([
      db.select({ valueJson: userData.valueJson })
        .from(userData)
        .where(and(eq(userData.userId, userId), eq(userData.key, 'corolla-washlog-v1')))
        .limit(1),
      db.select({ valueJson: userData.valueJson })
        .from(userData)
        .where(and(eq(userData.userId, userId), eq(userData.key, 'corolla-settings-v1')))
        .limit(1),
      db.select({ valueJson: userData.valueJson })
        .from(userData)
        .where(and(eq(userData.userId, userId), eq(userData.key, 'corolla-routines-v1')))
        .limit(1),
    ]);

    if (logRow.length === 0) return;

    type WashEntry = { date: string; type: string };
    const washLog: WashEntry[] = JSON.parse(logRow[0].valueJson);
    if (!Array.isArray(washLog) || washLog.length === 0) return;

    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);

    const savedSettings = settingsRow.length > 0 ? JSON.parse(settingsRow[0].valueJson) : null;
    const schedules: Array<{ routineId: string; intervalValue: number; intervalUnit: string }> =
      Array.isArray(savedSettings?.schedules) ? savedSettings.schedules : [];

    function routineMatchesLog(types: string[], logType: string, routineId: string): boolean {
      if (logType === routineId) return true;
      if (types.includes('exterior')    && ['full', 'quick', 'both'].includes(logType)) return true;
      if (types.includes('interior')    && ['interior', 'both'].includes(logType))      return true;
      if (types.includes('maintenance') && ['full', 'both'].includes(logType))          return true;
      return types.length === 0;
    }

    if (schedules.length > 0) {
      // Schedule-aware path: send one notification per overdue routine
      type RoutineEntry = { id: string; name: string; types: string[] };
      const routineList: RoutineEntry[] = routinesRow.length > 0
        ? JSON.parse(routinesRow[0].valueJson)
        : [];

      const mul: Record<string, number> = { days: 1, weeks: 7, months: 30, years: 365 };

      for (const schedule of schedules) {
        const routine = routineList.find(r => r.id === schedule.routineId);
        if (!routine) continue;

        const intervalDays = (schedule.intervalValue || 1) * (mul[schedule.intervalUnit] || 7);
        const relevant = washLog
          .filter(e => routineMatchesLog(routine.types ?? [], e.type, schedule.routineId))
          .sort((a, b) => b.date.localeCompare(a.date));

        if (!relevant.length) continue; // never logged — skip to avoid spamming

        const lastDate = new Date(relevant[0].date);
        const dueDate = new Date(lastDate);
        dueDate.setDate(dueDate.getDate() + intervalDays);

        if (todayUtc < dueDate) continue;

        const overdueDays = Math.floor((todayUtc.getTime() - dueDate.getTime()) / 86_400_000);
        const lastDateStr = lastDate.toISOString().slice(0, 10);
        const washBody = overdueDays > 0
          ? `Last session: ${lastDateStr}\nOverdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`
          : `Last session: ${lastDateStr}\nDue today`;

        if (notifSettings.washReminders && notifSettings.ticktickConnected) {
          await createTickTickTask(ownerEmail, {
            title:     `🚗 ${routine.name} due`,
            content:   washBody,
            projectId: notifSettings.ticktickProjectId ?? '',
            tags:      notifSettings.ticktickTags ?? [],
            priority:  notifSettings.ticktickPriority as 0 | 1 | 3 | 5,
            dueDate:   computeDueDate(notifSettings.ticktickDueDate),
          });
        }
        if (notifSettings.emailWashReminders) {
          await sendDirectEmail(ownerEmail, `🚗 ${routine.name} due`, washBody);
        }

        console.log(`Wash reminder sent — ${routine.name}, last: ${lastDateStr}, overdue: ${overdueDays}d`);
      }
    } else {
      // Legacy fallback: check most recent log entry against fullWash interval
      const lastDate = new Date(
        [...washLog].sort((a, b) => b.date.localeCompare(a.date))[0].date
      );
      const intervalDays = 14;
      const dueDate = new Date(lastDate);
      dueDate.setDate(dueDate.getDate() + intervalDays);

      if (todayUtc < dueDate) return;

      const overdueDays = Math.floor((todayUtc.getTime() - dueDate.getTime()) / 86_400_000);
      const lastDateStr = lastDate.toISOString().slice(0, 10);
      const washBody = overdueDays > 0
        ? `Last wash: ${lastDateStr}\nOverdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`
        : `Last wash: ${lastDateStr}\nDue today`;

      if (notifSettings.washReminders && notifSettings.ticktickConnected) {
        await createTickTickTask(ownerEmail, {
          title:     '🚗 Corolla wash due',
          content:   washBody,
          projectId: notifSettings.ticktickProjectId ?? '',
          tags:      notifSettings.ticktickTags ?? [],
          priority:  notifSettings.ticktickPriority as 0 | 1 | 3 | 5,
          dueDate:   computeDueDate(notifSettings.ticktickDueDate),
        });
      }
      if (notifSettings.emailWashReminders) {
        await sendDirectEmail(ownerEmail, '🚗 Corolla wash due', washBody);
      }

      console.log(`Wash reminder sent (legacy) — last wash: ${lastDateStr}, overdue: ${overdueDays}d`);
    }
  } catch (err) {
    console.error('Wash reminder cron error:', err);
  }
});

// Daily price digest: 08:00 UTC (after Autopro scrape + wash reminder).
// Sends only when there are on-sale items or threshold breaches. At most once per day via cron.
cron.schedule('0 8 * * *', async () => {
  const ownerEmail = process.env.OWNER_EMAIL ?? 'joh.10@pm.me';
  const notifSettings = await getOwnerNotificationSettings(ownerEmail);
  if (!notifSettings.emailDigest) return;

  try {
    const alertThresholds = await getOwnerAlertThresholds(ownerEmail);

    const saleItems = await db
      .select({ name: products.name, slug: products.slug, retailer: priceHistory.retailer, priceCents: priceHistory.priceCents })
      .from(priceHistory)
      .innerJoin(products, eq(priceHistory.productId, products.id))
      .where(and(
        eq(priceHistory.onSale, true),
        sql`price_history.observed_at = (SELECT MAX(ph2.observed_at) FROM price_history ph2 WHERE ph2.product_id = price_history.product_id AND ph2.retailer = price_history.retailer)`,
      ))
      .orderBy(products.name);

    const thresholdItems: DigestThresholdItem[] = [];
    const alertSlugs = Object.keys(alertThresholds);
    if (alertSlugs.length > 0) {
      const latestForAlerts = await db
        .select({ name: products.name, slug: products.slug, retailer: priceHistory.retailer, priceCents: priceHistory.priceCents })
        .from(priceHistory)
        .innerJoin(products, eq(priceHistory.productId, products.id))
        .where(and(
          inArray(products.slug, alertSlugs),
          sql`price_history.observed_at = (SELECT MAX(ph2.observed_at) FROM price_history ph2 WHERE ph2.product_id = price_history.product_id AND ph2.retailer = price_history.retailer)`,
        ))
        .orderBy(products.name);

      for (const row of latestForAlerts) {
        const threshold = alertThresholds[row.slug];
        if (threshold && row.priceCents <= threshold.thresholdCents) {
          thresholdItems.push({ name: row.name, retailer: row.retailer, priceCents: row.priceCents, thresholdCents: threshold.thresholdCents });
        }
      }
    }

    await sendDigestEmail(ownerEmail, saleItems, thresholdItems);
    console.log(`Digest sent — ${saleItems.length} on sale, ${thresholdItems.length} below threshold`);
  } catch (err) {
    console.error('Digest cron error:', err);
  }
});

const port = Number(process.env.PORT ?? 3000);
console.log(`Server running on port ${port}`);

serve({ fetch: app.fetch, port });
