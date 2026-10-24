// The two scheduled jobs (wash reminders at 07:00 UTC, the price digest at 08:00 UTC), run for every
// user who has signed in at least once. index.ts schedules them; each user is handled separately so
// one failure doesn't stop the rest.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { userData, products, priceHistory } from '../db/schema.js';
import {
  getNotificationRecipients,
  sendDirectEmail,
  sendDigestEmail,
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
