// The scheduled jobs. Wash reminders (07:00 UTC) and the price digest (08:00 UTC) run for every user
// who has signed in at least once, each user handled separately so one failure doesn't stop the
// rest. The stale-price check (08:00 UTC) emails only the admin. index.ts schedules them.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { userData, products, priceHistory, isRetailer, type Retailer } from '../db/schema.js';
import {
  getNotificationRecipients,
  sendDirectEmail,
  sendDigestEmail,
  RETAILER_DISPLAY,
  type DigestThresholdItem,
  type NotificationRecipient,
} from './email.js';
import { createTickTickTask } from './ticktick.js';

// Whether a wash log entry counts as a session of this routine: one logged against the routine
// itself, or a legacy entry (full/quick/interior/both) of a type the routine declares. A routine
// with no types only matches its own entries. Mirrors entryMatchesSchedule() in js/schedules.js;
// test/reminder-matching.test.ts runs both over the same cases.
export function routineMatchesLog(types: string[], logType: string, routineId: string): boolean {
  if (logType === routineId) return true;
  if (types.includes('exterior') && ['full', 'quick', 'both'].includes(logType)) return true;
  if (types.includes('interior') && ['interior', 'both'].includes(logType)) return true;
  if (types.includes('maintenance') && ['full', 'both'].includes(logType)) return true;
  return false;
}

async function readUserJson(userId: number, key: string): Promise<unknown> {
  const rows = await db
    .select({ valueJson: userData.valueJson })
    .from(userData)
    .where(and(eq(userData.userId, userId), eq(userData.key, key)))
    .limit(1);
  return rows.length > 0 ? JSON.parse(rows[0].valueJson) : null;
}

// Wash reminders: one notification per overdue routine in the user's settings.schedules, or the
// legacy fixed 14-day check when they have no schedules.
export async function runWashReminders(): Promise<void> {
  for (const recipient of await getNotificationRecipients()) {
    try {
      await sendWashReminders(recipient);
    } catch (err) {
      console.error(`Wash reminder error for user ${recipient.userId}:`, err);
    }
  }
}

async function sendWashReminders({ userId, email, settings: notif }: NotificationRecipient): Promise<void> {
  const viaTickTick = notif.washReminders && notif.ticktickConnected;
  if (!viaTickTick && !notif.emailWashReminders) return;

  const [savedLog, savedSettings, savedRoutines] = await Promise.all([
    readUserJson(userId, 'corolla-washlog-v1'),
    readUserJson(userId, 'corolla-settings-v1'),
    readUserJson(userId, 'corolla-routines-v1'),
  ]);

  type WashEntry = { date: string; type: string };
  const washLog = savedLog as WashEntry[] | null;
  if (!Array.isArray(washLog) || washLog.length === 0) return;

  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  const scheduleList = (savedSettings as { schedules?: unknown } | null)?.schedules;
  const schedules: Array<{ routineId: string; intervalValue: number; intervalUnit: string }> = Array.isArray(
    scheduleList,
  )
    ? scheduleList
    : [];

  const send = async (title: string, body: string, dueDate: string) => {
    if (viaTickTick) {
      await createTickTickTask(userId, {
        title,
        content: body,
        projectId: notif.ticktickProjectId ?? '',
        tags: notif.ticktickTags ?? [],
        priority: notif.ticktickPriority,
        dueDate,
      });
    }
    if (notif.emailWashReminders) {
      await sendDirectEmail(email, title, body);
    }
  };

  if (schedules.length > 0) {
    // Schedule-aware path: send one notification per overdue routine
    type RoutineEntry = { id: string; name: string; types: string[] };
    const routineList = Array.isArray(savedRoutines) ? (savedRoutines as RoutineEntry[]) : [];

    const mul: Record<string, number> = { days: 1, weeks: 7, months: 30, years: 365 };

    for (const schedule of schedules) {
      const routine = routineList.find((r) => r.id === schedule.routineId);
      if (!routine) continue;

      const intervalDays = (schedule.intervalValue || 1) * (mul[schedule.intervalUnit] || 7);
      const relevant = washLog
        .filter((e) => routineMatchesLog(routine.types ?? [], e.type, schedule.routineId))
        .sort((a, b) => b.date.localeCompare(a.date));

      if (!relevant.length) continue; // never logged — skip to avoid spamming

      const lastDate = new Date(relevant[0].date);
      const dueDate = new Date(lastDate);
      dueDate.setUTCDate(dueDate.getUTCDate() + intervalDays);

      if (todayUtc < dueDate) continue;

      const overdueDays = Math.floor((todayUtc.getTime() - dueDate.getTime()) / 86_400_000);
      const lastDateStr = lastDate.toISOString().slice(0, 10);
      const washBody =
        overdueDays > 0
          ? `Last session: ${lastDateStr}\nOverdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`
          : `Last session: ${lastDateStr}\nDue today`;

      await send(`🚗 ${routine.name} due`, washBody, dueDate.toISOString().replace(/\.\d{3}Z$/, '+0000'));
      console.log(
        `Wash reminder sent to user ${userId} — ${routine.name}, last: ${lastDateStr}, overdue: ${overdueDays}d`,
      );
    }
  } else {
    // Legacy fallback: check most recent log entry against fullWash interval
    const lastDate = new Date([...washLog].sort((a, b) => b.date.localeCompare(a.date))[0].date);
    const intervalDays = 14;
    const dueDate = new Date(lastDate);
    dueDate.setUTCDate(dueDate.getUTCDate() + intervalDays);

    if (todayUtc < dueDate) return;

    const overdueDays = Math.floor((todayUtc.getTime() - dueDate.getTime()) / 86_400_000);
    const lastDateStr = lastDate.toISOString().slice(0, 10);
    const washBody =
      overdueDays > 0
        ? `Last wash: ${lastDateStr}\nOverdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`
        : `Last wash: ${lastDateStr}\nDue today`;

    await send('🚗 Corolla wash due', washBody, dueDate.toISOString());
    console.log(`Wash reminder sent to user ${userId} (legacy) — last wash: ${lastDateStr}, overdue: ${overdueDays}d`);
  }
}

// Latest observation per product and retailer.
const isLatestObservation = sql`price_history.observed_at = (SELECT MAX(ph2.observed_at) FROM price_history ph2 WHERE ph2.product_id = price_history.product_id AND ph2.retailer = price_history.retailer)`;

// Daily price digest, email only, for users with it switched on. Sends only when there are on-sale
// items or threshold breaches (sendDigestEmail returns early otherwise).
export async function runDailyDigest(): Promise<void> {
  const recipients = (await getNotificationRecipients()).filter((r) => r.settings.emailDigest);
  if (recipients.length === 0) return;

  const saleItems = await db
    .select({
      name: products.name,
      slug: products.slug,
      retailer: priceHistory.retailer,
      priceCents: priceHistory.priceCents,
    })
    .from(priceHistory)
    .innerJoin(products, eq(priceHistory.productId, products.id))
    .where(and(eq(priceHistory.onSale, true), isLatestObservation))
    .orderBy(products.name);

  // Latest prices for every slug anyone has a threshold on, fetched once for all users.
  const alertSlugs = [...new Set(recipients.flatMap((r) => Object.keys(r.thresholds)))];
  const latestForAlerts =
    alertSlugs.length > 0
      ? await db
          .select({
            name: products.name,
            slug: products.slug,
            retailer: priceHistory.retailer,
            priceCents: priceHistory.priceCents,
          })
          .from(priceHistory)
          .innerJoin(products, eq(priceHistory.productId, products.id))
          .where(and(inArray(products.slug, alertSlugs), isLatestObservation))
          .orderBy(products.name)
      : [];

  for (const { userId, email, thresholds } of recipients) {
    try {
      const thresholdItems: DigestThresholdItem[] = [];
      for (const row of latestForAlerts) {
        const threshold = thresholds[row.slug];
        if (threshold && row.priceCents <= threshold.thresholdCents) {
          thresholdItems.push({
            name: row.name,
            retailer: row.retailer,
            priceCents: row.priceCents,
            thresholdCents: threshold.thresholdCents,
          });
        }
      }

      if (saleItems.length === 0 && thresholdItems.length === 0) continue;
      await sendDigestEmail(email, saleItems, thresholdItems);
      console.log(
        `Digest sent to user ${userId} — ${saleItems.length} on sale, ${thresholdItems.length} below threshold`,
      );
    } catch (err) {
      console.error(`Digest error for user ${userId}:`, err);
    }
  }
}

// A retailer counts as stale once its newest price is this many days old. Both scrapers run daily,
// so this allows for a couple of failed runs. js/data.js mirrors it for the Prices tab markers.
export const STALE_PRICE_DAYS = 3;

// Where to look when a retailer's prices stop. Auto Barn's runner going offline went unnoticed
// for a month in 2026 (see docs/decisions.md).
const STALE_HINTS: Record<Retailer, string> = {
  supercheap: 'Supercheap is scraped by GitHub Actions (scrape.yml). Check its recent runs for failures.',
  autobarn:
    'Auto Barn is scraped by the self-hosted runner on debian-server. If its runs in GitHub Actions show "cancelled", the runner is offline.',
};

export interface StaleRetailer {
  retailer: Retailer;
  lastObservedAt: string | null; // SQLite UTC timestamp, null if it has never had a price
}

// Retailers with at least one product URL whose newest price is older than STALE_PRICE_DAYS, or
// that have never had one.
export async function findStaleRetailers(): Promise<StaleRetailer[]> {
  const rows = await db.all<{ retailer: string; last_observed_at: string | null }>(sql`
    SELECT retailer, last_observed_at FROM (
      SELECT r.retailer,
        (SELECT MAX(ph.observed_at) FROM price_history ph WHERE ph.retailer = r.retailer) AS last_observed_at
      FROM (SELECT DISTINCT retailer FROM retailer_urls) r
    )
    WHERE last_observed_at IS NULL OR last_observed_at < datetime('now', ${`-${STALE_PRICE_DAYS} days`})
    ORDER BY retailer
  `);
  return rows
    .filter((row) => isRetailer(row.retailer))
    .map((row) => ({ retailer: row.retailer as Retailer, lastObservedAt: row.last_observed_at }));
}

// Emails the admin (OWNER_EMAIL) when any retailer has stopped getting prices, every day until it
// recovers. Nothing is sent while prices are current.
export async function runStalePriceCheck(): Promise<void> {
  const stale = await findStaleRetailers();
  if (stale.length === 0) return;

  const owner = process.env.OWNER_EMAIL;
  const names = stale.map((s) => RETAILER_DISPLAY[s.retailer] ?? s.retailer);
  if (!owner) {
    console.error(`Prices are stale for ${names.join(', ')}, but OWNER_EMAIL is not set, so nobody was told.`);
    return;
  }

  const paragraphs = stale.map(({ retailer, lastObservedAt }, i) => {
    let status = `${names[i]} has product URLs but has never had a price.`;
    if (lastObservedAt) {
      const days = Math.floor((Date.now() - Date.parse(`${lastObservedAt.replace(' ', 'T')}Z`)) / 86_400_000);
      status = `No new ${names[i]} prices since ${lastObservedAt.slice(0, 10)} (${days} days).`;
    }
    return `${status}\n${STALE_HINTS[retailer]}`;
  });
  const body = `${paragraphs.join('\n\n')}\n\nThis email repeats each day until prices update.`;

  await sendDirectEmail(owner, `⚠️ Prices not updating: ${names.join(', ')}`, body);
  console.log(`Stale-price alert sent — ${names.join(', ')}`);
}
