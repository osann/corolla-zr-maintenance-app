// Browser smoke tests: the real backend and frontend in headless Chromium (npm run test:e2e). They
// check that the app loads and every tab works signed out, as a member and as the admin, that each
// account sees only its own controls, and the flows the backend tests can't reach.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ADMIN_SESSION,
  MEMBER_EMAIL,
  MEMBER_SESSION,
  addAccounts,
  isHidden,
  missingHandlers,
  onServer,
  openApp,
  startApp,
  stored,
  visitEveryTab,
  type App,
} from './harness.js';

let app: App;

const ADMIN_ONLY = ['.inv-sub-tab[data-inv-tab="products"]', '#settings-users', '#settings-categories'];

beforeAll(async () => {
  app = await startApp();
  await addAccounts(app.db);

  // Current Supercheap prices for a few products, so the Prices tab has content, plus one Auto
  // Barn price that stopped updating nine days ago.
  const products: { id: number; slug: string; urls: Record<string, string> }[] = await (
    await fetch(`${app.origin}/api/products`)
  ).json();
  const priced = products.filter((p) => p.urls.supercheap && p.urls.autobarn).slice(0, 5);
  const res = await app.postPrices(
    priced.map((p, i) => ({ slug: p.slug, retailer: 'supercheap', priceCents: 1500 + i * 100, compareAtCents: null })),
  );
  expect(res.ok).toBe(true);
  await app.db.execute({
    sql: `INSERT INTO price_history (product_id, retailer, price_cents, observed_at) VALUES (?, 'autobarn', 2899, datetime('now', '-9 days'))`,
    args: [priced[0].id],
  });
});

afterAll(() => app?.stop());

describe('signed out', () => {
  it('opens every tab without errors, with the personal ones hidden', async () => {
    const { page, errors, close } = await openApp(app);
    // Log, Maintenance, Inventory and the routine sub-tabs need an account.
    expect(await visitEveryTab(page)).toEqual(['routine', 'guide', 'settings']);
    expect(await missingHandlers(page)).toEqual([]);
    expect(errors).toEqual([]);
    await close();
  });

  it('hides admin-only UI and says accounts are invite-only', async () => {
    const { page, close } = await openApp(app);
    for (const selector of ADMIN_ONLY) expect(await isHidden(page, selector), selector).toBe(true);
    expect(await page.textContent('#auth-login-form')).toContain('invite-only');
    await close();
  });

  // Counted from each routine's own sessions only, like the reminder cron. The clock is fixed so
  // the overdue gap always spans Sydney's DST change on 4 October 2026.
  it('shows reminder cards counted from the routine’s own sessions', async () => {
    const { page, errors, close } = await openApp(app, {
      now: new Date('2026-10-24T12:00:00+11:00'),
      storage: {
        'corolla-routines-v1': [
          { id: 'r1', name: "Bob's exterior detail", subtext: '', types: [], steps: [], alerts: [] },
          { id: 'r2', name: 'Interior tidy', subtext: '', types: [], steps: [], alerts: [] },
          { id: 'r3', name: 'Quick rinse', subtext: '', types: [], steps: [], alerts: [] },
        ],
        'corolla-settings-v1': {
          schedules: [
            { routineId: 'r1', intervalValue: 1, intervalUnit: 'weeks' },
            { routineId: 'r2', intervalValue: 1, intervalUnit: 'weeks' },
          ],
        },
        'corolla-washlog-v1': [
          { id: 1, date: '2026-09-24', type: 'r2', steps: [], notes: '' },
          { id: 2, date: '2026-10-23', type: 'r3', steps: [], notes: '' },
        ],
      },
    });
    const cards = await page.$$eval('#wash-reminder-cards .wash-reminder-card', (els) =>
      els.map(
        (el) =>
          `${el.querySelector('.reminder-name')?.textContent}: ${el.querySelector('.reminder-status')?.textContent}`,
      ),
    );
    expect(cards).toEqual(["Bob's exterior detail: No sessions logged yet", 'Interior tidy: Overdue by 23 days']);
    expect(errors).toEqual([]);
    await close();
  });
});

describe('signed in as the admin', () => {
  it('shows admin-only UI and opens every tab and sub-tab without errors', async () => {
    const { page, errors, close } = await openApp(app, { session: ADMIN_SESSION });
    await page.waitForSelector('#users-list .settings-row', { state: 'attached' });
    for (const selector of ADMIN_ONLY) expect(await isHidden(page, selector), selector).toBe(false);
    expect(await page.textContent('#users-list')).toContain(MEMBER_EMAIL);
    expect((await visitEveryTab(page)).some((tab) => tab.includes('data-inv-tab="products"'))).toBe(true);
    expect(await missingHandlers(page)).toEqual([]);
    expect(errors).toEqual([]);
    await close();
  });
});

describe('signed in as a member', () => {
  it('hides admin-only UI, opens every tab without errors, and is refused by the admin API', async () => {
    const { page, errors, close } = await openApp(app, { session: MEMBER_SESSION });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('corolla-auth-v1') ?? 'null')?.email);
    for (const selector of ADMIN_ONLY) expect(await isHidden(page, selector), selector).toBe(true);
    expect((await visitEveryTab(page)).length).toBeGreaterThan(15);
    expect(await missingHandlers(page)).toEqual([]);
    const status = await page.evaluate(
      async () => (await fetch('/api/admin/users', { credentials: 'include' })).status,
    );
    expect(status).toBe(403);
    expect(errors).toEqual([]);
    await close();
  });

  it('flags a price that has stopped updating', async () => {
    const { page, close } = await openApp(app, { session: MEMBER_SESSION });
    await page.click('.tab[data-tab="inventory"]');
    await page.click('[data-inv-tab="prices"]');
    await page.waitForSelector('#prices-list .price-stale');
    const titles = await page.$$eval('#prices-list .price-stale', (els) => els.map((el) => el.getAttribute('title')));
    expect(titles).toEqual([expect.stringMatching(/^Auto Barn price not updated for 9 days \(last updated /)]);
    await close();
  });

  it('exports a backup and restores it to the account', async () => {
    const log = [
      { id: 1, date: '2026-10-01', type: 'full', steps: [], notes: 'first' },
      { id: 2, date: '2026-10-08', type: 'full', steps: [], notes: 'second' },
    ];
    await app.db.execute({
      sql: `INSERT INTO user_data (user_id, key, value_json) SELECT id, 'corolla-washlog-v1', ? FROM users WHERE email = ?`,
      args: [JSON.stringify(log), MEMBER_EMAIL],
    });
    const { page, errors, dialogs, close } = await openApp(app, { session: MEMBER_SESSION });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('corolla-washlog-v1') ?? '[]').length === 2);
    await page.click('.tab[data-tab="settings"]');

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[onclick="exportData()"]')]);
    const backupPath = join(mkdtempSync(join(tmpdir(), 'corolla-backup-')), 'backup.json');
    await download.saveAs(backupPath);
    const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
    expect(backup).toMatchObject({ app: 'Corolla ZR Detailing Guide', format: 2 });
    expect(backup.data['corolla-washlog-v1']).toEqual(log);
    expect(backup.data).not.toHaveProperty('corolla-categories-v1'); // shared, and only the admin's to restore

    await page.click('[onclick="clearLog()"]');
    await expect.poll(() => onServer(page, 'corolla-washlog-v1')).toEqual([]);

    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[onclick="importData()"]')]);
    await Promise.all([page.waitForEvent('load'), chooser.setFiles(backupPath)]);
    await page.waitForLoadState('networkidle');
    expect(dialogs.some((d) => d.startsWith('Restore '))).toBe(true);
    expect(await stored(page, 'corolla-washlog-v1')).toEqual(log);
    expect(await onServer(page, 'corolla-washlog-v1')).toEqual(log);
    expect(errors).toEqual([]);
    await close();
  });
});
