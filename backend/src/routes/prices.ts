import { Hono } from 'hono';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, priceHistory, isRetailer } from '../db/schema.js';
import { isOnSale } from '../lib/sale-detector.js';
import { sendDirectEmail, getNotificationRecipients, type NotificationRecipient } from '../lib/email.js';
import { createTickTickTask } from '../lib/ticktick.js';

const router = new Hono();

export interface PriceObservation {
  slug: string;
  retailer: string;
  priceCents: number;
  compareAtCents: number | null;
}

const wantsSaleAlerts = ({ settings: s }: NotificationRecipient) => s.saleAlerts && (s.ticktickAlerts || s.emailAlerts);
const wantsThresholdAlerts = ({ settings: s }: NotificationRecipient) =>
  s.thresholdAlerts && (s.ticktickAlerts || s.emailAlerts);

// The recipient's threshold for this slug, if the price is at or below it.
function breachedThreshold(recipient: NotificationRecipient, slug: string, priceCents: number) {
  const threshold = recipient.thresholds[slug];
  return threshold?.thresholdCents != null && priceCents <= threshold.thresholdCents ? threshold : null;
}

// POST /api/prices — ingest scraper results from GitHub Actions
// Requires: Authorization: Bearer <SCRAPE_SECRET>
router.post('/prices', async (c) => {
  const secret = process.env.SCRAPE_SECRET;
  if (secret) {
    const auth = c.req.header('Authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }

  let body: PriceObservation[];
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  if (!Array.isArray(body) || body.length === 0) {
    return c.json({ error: 'Expected non-empty array of observations' }, 400);
  }

  const recipients = await getNotificationRecipients();

  let inserted = 0;
  let skipped = 0;

  for (const obs of body) {
    const { slug, retailer, priceCents, compareAtCents } = obs;

    // Unknown or retired retailers (see docs/blocked-retailers.md) are skipped, not stored.
    if (!slug || !isRetailer(retailer) || typeof priceCents !== 'number') {
      skipped++;
      continue;
    }

    const productRows = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);

    if (productRows.length === 0) {
      skipped++;
      continue;
    }

    const productId = productRows[0].id;

    const avgRows = await db
      .select({ avg: sql<number>`AVG(price_cents)` })
      .from(priceHistory)
      .where(
        and(
          eq(priceHistory.productId, productId),
          eq(priceHistory.retailer, retailer),
          gt(priceHistory.observedAt, sql`datetime('now', '-30 days')`),
        ),
      );
    const rollingAvg = avgRows[0]?.avg ?? null;

    const onSale = isOnSale(priceCents, compareAtCents, rollingAvg);

    await db.insert(priceHistory).values({
      productId,
      retailer: retailer,
      priceCents,
      onSale,
    });
    inserted++;

    // Who this observation could notify. Whether it does depends on the previous observation,
    // since both alert types fire only on a transition.
    const interested = recipients.filter(
      (r) =>
        (onSale && wantsSaleAlerts(r)) || (breachedThreshold(r, slug, priceCents) != null && wantsThresholdAlerts(r)),
    );
    if (interested.length === 0) continue;

    const recent = await db
      .select({ onSale: priceHistory.onSale, priceCents: priceHistory.priceCents })
      .from(priceHistory)
      .where(and(eq(priceHistory.productId, productId), eq(priceHistory.retailer, retailer)))
      .orderBy(desc(priceHistory.observedAt))
      .limit(2);
    const previouslyOnSale = recent[1]?.onSale ?? false;
    const prevPriceCents = recent[1]?.priceCents;

    const productName = productRows[0].name;
    const currentPrice = `$${(priceCents / 100).toFixed(2)}`;
    const retailerName = retailer.charAt(0).toUpperCase() + retailer.slice(1);

    for (const recipient of interested) {
      // On-sale alert (transition only)
      if (onSale && wantsSaleAlerts(recipient) && !previouslyOnSale) {
        const prevLine = prevPriceCents ? `Previous price: $${(prevPriceCents / 100).toFixed(2)}\n` : '';
        const baseSubject = `🔥 ${productName} on sale at ${retailerName} — ${currentPrice}`;
        const bodyText = `Current price: ${currentPrice}\n${prevLine}`;
        sendViaChannel('global', recipient, baseSubject, bodyText);
      }

      // Threshold alert (transition only — prev price was above threshold)
      const threshold = breachedThreshold(recipient, slug, priceCents);
      if (threshold && wantsThresholdAlerts(recipient)) {
        const prevWasAbove = prevPriceCents == null || prevPriceCents > threshold.thresholdCents;
        if (prevWasAbove) {
          const thresholdDollar = `$${(threshold.thresholdCents / 100).toFixed(2)}`;
          const baseSubject = `⬇️ ${productName} below ${thresholdDollar} at ${retailerName} — ${currentPrice}`;
          const bodyText = `Your alert threshold: ${thresholdDollar}\nCurrent price: ${currentPrice}`;
          sendViaChannel(threshold.channel, recipient, baseSubject, bodyText);
        }
      }
    }
  }

  return c.json({ inserted, skipped });
});

function sendViaChannel(
  channel: 'global' | 'ticktick' | 'email',
  { userId, email, settings }: NotificationRecipient,
  baseSubject: string,
  body: string,
): void {
  const sendTT =
    settings.ticktickAlerts && (channel === 'ticktick' || channel === 'global') && settings.ticktickConnected;
  const sendEmail = settings.emailAlerts && (channel === 'email' || channel === 'global');

  if (sendTT) {
    createTickTickTask(userId, {
      title: baseSubject,
      content: body,
      projectId: settings.ticktickProjectId ?? '',
      tags: settings.ticktickTags ?? [],
      priority: settings.ticktickPriority,
    }).catch(console.error);
  }
  if (sendEmail) {
    sendDirectEmail(email, baseSubject, body).catch(console.error);
  }
}

export default router;
