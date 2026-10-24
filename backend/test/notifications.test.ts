import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/connection.js';
import { users, userData, products } from '../src/db/schema.js';
import { initDb } from '../src/db/init.js';
import { seed } from '../src/db/seed.js';
import { sendDirectEmail, sendDigestEmail } from '../src/lib/email.js';
import { runDailyDigest, runWashReminders } from '../src/lib/notifications.js';
import pricesRouter from '../src/routes/prices.js';

// Record outgoing email instead of sending it. Everything else in email.ts (settings, thresholds,
// recipients) is the real code.
vi.mock('../src/lib/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/email.js')>()),
  sendDirectEmail: vi.fn(async () => {}),
  sendDigestEmail: vi.fn(async () => {}),
}));

const app = new Hono();
app.route('/api', pricesRouter);

let slug: string;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const recipientsOf = (mock: unknown) => vi.mocked(mock as typeof sendDirectEmail).mock.calls.map((call) => call[0]);
const postPrices = (body: unknown) =>
  app.request('/api/prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-secret' },
    body: JSON.stringify(body),
  });

async function addUser(email: string, joined: boolean, data: Record<string, unknown>) {
  const [user] = await db
    .insert(users)
    .values({ email, joinedAt: joined ? new Date().toISOString() : null })
    .returning();
  await db
    .insert(userData)
    .values(Object.entries(data).map(([key, value]) => ({ userId: user.id, key, valueJson: JSON.stringify(value) })));
}

beforeAll(async () => {
  await initDb();
  await seed();
  [{ slug }] = await db.select({ slug: products.slug }).from(products).where(eq(products.isPack, false)).limit(1);

  const weekly = [{ routineId: 'r1', intervalValue: 1, intervalUnit: 'weeks' }];
  const routines = [{ id: 'r1', name: 'Full wash', types: ['exterior'] }];
  const emailEverything = { emailAlerts: true, emailDigest: true, emailWashReminders: true };

  // Due for a wash, threshold $20, wants everything by email.
  await addUser('ann@example.com', true, {
    'corolla-settings-v1': { notifications: emailEverything, schedules: weekly },
    'corolla-price-alerts-v1': { [slug]: { thresholdCents: 2000, channel: 'email' } },
    'corolla-routines-v1': routines,
    'corolla-washlog-v1': [{ date: daysAgo(30), type: 'r1' }],
  });
  // Washed today, threshold $10, no digest.
  await addUser('ben@example.com', true, {
    'corolla-settings-v1': { notifications: { emailAlerts: true, emailWashReminders: true }, schedules: weekly },
    'corolla-price-alerts-v1': { [slug]: { thresholdCents: 1000, channel: 'email' } },
    'corolla-routines-v1': routines,
    'corolla-washlog-v1': [{ date: daysAgo(0), type: 'r1' }],
  });
  // Invited but never signed in: gets nothing, whatever their data says.
  await addUser('pending@example.com', false, {
    'corolla-settings-v1': { notifications: emailEverything, schedules: weekly },
    'corolla-price-alerts-v1': { [slug]: { thresholdCents: 3000, channel: 'email' } },
    'corolla-routines-v1': routines,
    'corolla-washlog-v1': [{ date: daysAgo(30), type: 'r1' }],
  });
});

beforeEach(() => {
  vi.mocked(sendDirectEmail).mockClear();
  vi.mocked(sendDigestEmail).mockClear();
});

describe('price alerts', () => {
  it('emails only the users whose own threshold the price crossed', async () => {
    await postPrices([{ slug, retailer: 'supercheap', priceCents: 1500, compareAtCents: null }]);
    expect(recipientsOf(sendDirectEmail)).toEqual(['ann@example.com']);
    expect(vi.mocked(sendDirectEmail).mock.calls[0][1]).toMatch(/^⬇️ .* below \$20\.00/);
  });

  it('sends a sale alert to every joined user who wants them', async () => {
    await postPrices([{ slug, retailer: 'autobarn', priceCents: 2500, compareAtCents: 2999 }]);
    expect(recipientsOf(sendDirectEmail).sort()).toEqual(['ann@example.com', 'ben@example.com']);
    expect(vi.mocked(sendDirectEmail).mock.calls.every((call) => call[1].startsWith('🔥'))).toBe(true);
  });

  it("doesn't repeat an alert while nothing has changed", async () => {
    await postPrices([
      { slug, retailer: 'supercheap', priceCents: 1400, compareAtCents: null },
      { slug, retailer: 'autobarn', priceCents: 2500, compareAtCents: 2999 },
    ]);
    expect(sendDirectEmail).not.toHaveBeenCalled();
  });
});

describe('daily digest', () => {
  it('goes to each user with it switched on, with their own thresholds', async () => {
    await runDailyDigest();
    expect(sendDigestEmail).toHaveBeenCalledTimes(1);
    const [to, saleItems, thresholdItems] = vi.mocked(sendDigestEmail).mock.calls[0];
    expect(to).toBe('ann@example.com');
    // Compared as sets: observed_at only has one-second resolution, so rows posted above within the
    // same second all count as the latest for their retailer. Real scrapes are hours apart.
    expect(new Set(saleItems.map((i) => i.retailer))).toEqual(new Set(['autobarn']));
    expect(new Set(thresholdItems.map((i) => `${i.retailer} ${i.thresholdCents}`))).toEqual(
      new Set(['supercheap 2000']),
    );
  });
});

describe('wash reminders', () => {
  it('reminds each user whose own routine is overdue', async () => {
    await runWashReminders();
    expect(vi.mocked(sendDirectEmail).mock.calls).toEqual([
      ['ann@example.com', '🚗 Full wash due', expect.stringContaining('Overdue by')],
    ]);
  });
});
