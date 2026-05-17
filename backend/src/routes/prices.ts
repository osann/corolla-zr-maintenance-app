import { Hono } from 'hono';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { products, priceHistory } from '../db/schema.js';
import { isOnSale } from '../lib/sale-detector.js';
import {
  sendTickTickTask,
  sendDirectEmail,
  getOwnerNotificationSettings,
  getOwnerAlertThresholds,
} from '../lib/email.js';

const router = new Hono();

export interface PriceObservation {
  slug: string;
  retailer: string;
  priceCents: number;
  compareAtCents: number | null;
}

type RetailerEnum = 'bowdens' | 'supercheap' | 'repco' | 'autopro' | 'autobarn';

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

  const ownerEmail = process.env.OWNER_EMAIL ?? 'joh.10@pm.me';
  const [notifSettings, alertThresholds] = await Promise.all([
    getOwnerNotificationSettings(ownerEmail),
    getOwnerAlertThresholds(ownerEmail),
  ]);

  let inserted = 0;
  let skipped = 0;

  for (const obs of body) {
    const { slug, retailer, priceCents, compareAtCents } = obs;

    if (!slug || !retailer || typeof priceCents !== 'number') {
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
      .where(and(
        eq(priceHistory.productId, productId),
        eq(priceHistory.retailer, retailer as RetailerEnum),
        gt(priceHistory.observedAt, sql`datetime('now', '-30 days')`),
      ));
    const rollingAvg = avgRows[0]?.avg ?? null;

    const onSale = isOnSale(priceCents, compareAtCents, rollingAvg);

    await db.insert(priceHistory).values({
      productId,
      retailer: retailer as RetailerEnum,
      priceCents,
      onSale,
    });

    const threshold = alertThresholds[slug];
    const thresholdBreached = threshold?.thresholdCents != null && priceCents <= threshold.thresholdCents;

    if ((onSale || thresholdBreached) && (notifSettings.ticktickAlerts || notifSettings.emailAlerts)) {
      const recent = await db
        .select({ onSale: priceHistory.onSale, priceCents: priceHistory.priceCents })
        .from(priceHistory)
        .where(and(
          eq(priceHistory.productId, productId),
          eq(priceHistory.retailer, retailer as RetailerEnum),
        ))
        .orderBy(desc(priceHistory.observedAt))
        .limit(2);

      const productName  = productRows[0].name;
      const currentPrice = `$${(priceCents / 100).toFixed(2)}`;
      const retailerName = retailer.charAt(0).toUpperCase() + retailer.slice(1);

      // On-sale alert (transition only)
      if (onSale) {
        const previouslyOnSale = recent[1]?.onSale ?? false;
        if (!previouslyOnSale) {
          const prevCents = recent[1]?.priceCents;
          const prevLine  = prevCents ? `Previous price: $${(prevCents / 100).toFixed(2)}\n` : '';
          const baseSubject = `🔥 ${productName} on sale at ${retailerName} — ${currentPrice}`;
          const bodyText    = `Current price: ${currentPrice}\n${prevLine}`;
          sendViaChannel('global', notifSettings, ownerEmail, baseSubject, bodyText);
        }
      }

      // Threshold alert (transition only — prev price was above threshold)
      if (thresholdBreached) {
        const prevPriceCents = recent[1]?.priceCents;
        const prevWasAbove   = prevPriceCents == null || prevPriceCents > threshold.thresholdCents;
        if (prevWasAbove) {
          const thresholdDollar = `$${(threshold.thresholdCents / 100).toFixed(2)}`;
          const baseSubject = `⬇️ ${productName} below ${thresholdDollar} at ${retailerName} — ${currentPrice}`;
          const bodyText    = `Your alert threshold: ${thresholdDollar}\nCurrent price: ${currentPrice}`;
          const channel = threshold.channel === 'global' ? 'global' : threshold.channel;
          sendViaChannel(channel, notifSettings, ownerEmail, baseSubject, bodyText);
        }
      }
    }

    inserted++;
  }

  return c.json({ inserted, skipped });
});

function sendViaChannel(
  channel: 'global' | 'ticktick' | 'email',
  notifSettings: { ticktickAlerts: boolean; ticktickEmail: string | null; ticktickMetadata: string; emailAlerts: boolean },
  ownerEmail: string,
  baseSubject: string,
  body: string,
): void {
  const sendTT = notifSettings.ticktickAlerts &&
    (channel === 'ticktick' || channel === 'global') &&
    !!notifSettings.ticktickEmail;
  const sendEmail = notifSettings.emailAlerts &&
    (channel === 'email' || channel === 'global');

  if (sendTT) {
    const meta = notifSettings.ticktickMetadata?.trim();
    const ttSubject = meta ? `${baseSubject} ${meta}` : baseSubject;
    sendTickTickTask(notifSettings.ticktickEmail!, ttSubject, body).catch(console.error);
  }
  if (sendEmail) {
    sendDirectEmail(ownerEmail, baseSubject, body).catch(console.error);
  }
}

export default router;
