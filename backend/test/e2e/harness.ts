// Runs the real backend (src/index.ts) against a throwaway SQLite DB, and serves the frontend with
// /api proxied to it on the same origin, the way the Cloudflare Worker does in production, so the
// session cookie works. Used by the browser smoke tests (npm run test:e2e).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type Client } from '@libsql/client';
import { chromium, type Browser, type Page } from 'playwright';

const BACKEND_DIR = fileURLToPath(new URL('../..', import.meta.url));
const REPO_ROOT = resolve(BACKEND_DIR, '..');

export const ADMIN_EMAIL = 'owner@example.com';
export const MEMBER_EMAIL = 'member@example.com';
export const ADMIN_SESSION = 'e2e-admin-session';
export const MEMBER_SESSION = 'e2e-member-session';
const SCRAPE_SECRET = 'e2e-secret';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
};

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  await new Promise((done) => server.close(done));
  return port;
}

async function waitUntil(check: () => Promise<boolean>, what: string, log: () => string) {
  for (let i = 0; i < 120; i++) {
    if (await check().catch(() => false)) return;
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`${what} didn't happen within a minute.\n${log()}`);
}

export interface App {
  origin: string; // the frontend, with /api on the same origin
  db: Client; // the backend's database
  browser: Browser;
  tmpDir: string; // deleted by stop()
  postPrices(observations: unknown[]): Promise<Response>;
  stop(): Promise<void>;
}

export async function startApp(): Promise<App> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'corolla-e2e-'));
  const dbUrl = `file:${join(tmpDir, 'e2e.sqlite').replace(/\\/g, '/')}`;
  const apiPort = await freePort();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TURSO_URL: dbUrl,
    PORT: String(apiPort),
    OWNER_EMAIL: ADMIN_EMAIL,
    SCRAPE_SECRET,
    // Resend is constructed at import and throws without a key. Nothing here should send email;
    // anything that tries fails against Resend with this key.
    RESEND_API_KEY: 're_test_dummy',
  };
  delete env.TURSO_TOKEN;

  const backend = spawn(process.execPath, ['--import', 'tsx/esm', 'src/index.ts'], { cwd: BACKEND_DIR, env });
  let backendLog = '';
  backend.stdout.on('data', (chunk) => (backendLog += chunk));
  backend.stderr.on('data', (chunk) => (backendLog += chunk));
  const api = `http://127.0.0.1:${apiPort}`;
  await waitUntil(
    async () => (await fetch(`${api}/api/health`)).ok,
    'The backend starting',
    () => backendLog,
  );

  let origin = ''; // set once the server is listening
  const server: Server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path.startsWith('/api/')) {
      const upstream = request(
        { host: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers: req.headers },
        (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
          upstreamRes.pipe(res);
        },
      );
      upstream.on('error', () => res.writeHead(502).end());
      req.pipe(upstream);
      return;
    }
    const file = resolve(REPO_ROOT, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(REPO_ROOT + sep)) return res.writeHead(404).end();
    try {
      let body: Buffer | string = await readFile(file);
      // deploy.yml does the same substitution with sed.
      if (path === '/js/config.js') body = body.toString().replace('__BACKEND_URL__', origin);
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const db = createClient({ url: dbUrl });
  const browser = await chromium.launch();

  return {
    origin,
    db,
    browser,
    tmpDir,
    postPrices: (observations) =>
      fetch(`${api}/api/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SCRAPE_SECRET}` },
        body: JSON.stringify(observations),
      }),
    async stop() {
      await browser.close();
      db.close();
      await new Promise((done) => server.close(done));
      // Wait for the backend to exit so it lets go of the DB file (Windows won't delete it before).
      const exited = new Promise((done) => backend.once('exit', done));
      backend.kill();
      await exited;
      rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

// The admin and one regular member, both signed in already, with sessions the tests can use.
export async function addAccounts(db: Client) {
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 86_400_000).toISOString();
  for (const [email, session] of [
    [ADMIN_EMAIL, ADMIN_SESSION],
    [MEMBER_EMAIL, MEMBER_SESSION],
  ]) {
    const { lastInsertRowid } = await db.execute({
      sql: 'INSERT INTO users (email, joined_at) VALUES (?, ?)',
      args: [email, now],
    });
    await db.execute({
      sql: 'INSERT INTO sessions (session_id, user_id, expires_at) VALUES (?, ?, ?)',
      args: [session, lastInsertRowid!, expires],
    });
  }
}

export interface OpenedPage {
  page: Page;
  errors: string[]; // uncaught exceptions and console errors
  close(): Promise<void>;
}

// A fresh browser context in Sydney time, like the app's users (so nothing carries over between
// tests), optionally signed in, with localStorage seeded and the clock fixed, with the app loaded
// and its first round of requests finished. Dialogs (confirm, alert) are accepted and recorded.
export async function openApp(
  app: App,
  { session, storage, now }: { session?: string; storage?: Record<string, unknown>; now?: Date } = {},
): Promise<OpenedPage & { dialogs: string[] }> {
  const context = await app.browser.newContext({
    acceptDownloads: true,
    timezoneId: 'Australia/Sydney',
    locale: 'en-AU',
  });
  if (now) await context.clock.setFixedTime(now);
  if (session) await context.addCookies([{ name: 'session', value: session, url: app.origin }]);
  if (storage) {
    // Only on the first load, so a reload sees whatever the app saved since.
    await context.addInitScript((items) => {
      if (sessionStorage.getItem('e2e-seeded')) return;
      for (const [key, value] of Object.entries(items)) localStorage.setItem(key, JSON.stringify(value));
      sessionStorage.setItem('e2e-seeded', '1');
    }, storage);
  }
  const page = await context.newPage();
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    dialog.accept();
  });
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    // Failed requests (no fonts offline, no R2 here) are logged as console errors; they're not bugs.
    if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) errors.push(msg.text());
  });
  await page.goto(app.origin);
  await page.waitForLoadState('networkidle');
  return { page, errors, dialogs, close: () => context.close() };
}

// The value the app stored under a localStorage key, parsed.
export const stored = (page: Page, key: string) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);

// The signed-in account's copy of a synced store on the server.
export const onServer = (page: Page, key: string) =>
  page.evaluate(async (k) => (await (await fetch('/api/sync', { credentials: 'include' })).json())[k] ?? null, key);

// Every function named in a rendered on*= attribute that isn't on window. The static check in
// test/inline-handlers.test.ts reads the source; this catches anything built some other way.
export const missingHandlers = (page: Page) =>
  page.evaluate(() => {
    const missing = new Set<string>();
    for (const el of document.querySelectorAll('*')) {
      for (const attr of el.attributes) {
        if (!attr.name.startsWith('on')) continue;
        const code = attr.value.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''");
        for (const [, name] of code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
          if (
            !['if', 'return', 'function', 'typeof', 'new'].includes(name) &&
            typeof window[name as never] !== 'function'
          ) {
            missing.add(`${name} (${attr.name} on <${el.tagName.toLowerCase()}>)`);
          }
        }
      }
    }
    return [...missing];
  });

// Clicks through every top-level tab and every visible sub-tab, returning what it visited.
export async function visitEveryTab(page: Page): Promise<string[]> {
  const visited: string[] = [];
  // Signed out, some tabs are hidden with display: none rather than the hidden attribute.
  const tabs = await page.$$eval('.tab[data-tab]', (els) =>
    els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => (el as HTMLElement).dataset.tab!),
  );
  for (const tab of tabs) {
    await page.click(`.tab[data-tab="${tab}"]`);
    visited.push(tab);
    const subTabs = await page.$$eval(
      '[data-inv-tab], [data-log-tab], [data-maintenance-tab], [data-routine-tab]',
      (els) =>
        els
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => {
            const attr = [...el.attributes].find((a) => /^data-\w+-tab$/.test(a.name))!;
            return `[${attr.name}="${attr.value}"]`;
          }),
    );
    for (const selector of subTabs) {
      await page.click(selector);
      visited.push(`${tab} ${selector}`);
    }
  }
  return visited;
}

export const isHidden = (page: Page, selector: string) =>
  page.$eval(selector, (el) => (el as HTMLElement).hidden || getComputedStyle(el).display === 'none');
