import { Hono } from 'hono';
import { sessionMiddleware } from '../lib/auth.js';
import {
  storeOAuthTokens, fetchTickTickProjects, isTickTickConnected, disconnectTickTick,
} from '../lib/ticktick.js';

const router = new Hono();

const CLIENT_ID    = () => process.env.TICKTICK_CLIENT_ID!;
const CLIENT_SECRET = () => process.env.TICKTICK_CLIENT_SECRET!;
const REDIRECT_URI  = () => `${process.env.BACKEND_PUBLIC_URL}/api/ticktick/callback`;
const OWNER_EMAIL   = () => process.env.OWNER_EMAIL ?? 'joh.10@pm.me';
const AUTH_URL      = 'https://ticktick.com/oauth/authorize';
const TOKEN_URL     = 'https://ticktick.com/oauth/token';

// Redirect to TickTick OAuth — session-protected so only the owner can connect.
router.get('/ticktick/auth', sessionMiddleware, (c) => {
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id',     CLIENT_ID());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri',  REDIRECT_URI());
  url.searchParams.set('scope',         'tasks:write tasks:read');
  return c.redirect(url.toString());
});

// TickTick redirects back here with ?code=...
router.get('/ticktick/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.text('Missing code', 400);

  const creds = Buffer.from(`${CLIENT_ID()}:${CLIENT_SECRET()}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI(),
    }),
  });

  if (!res.ok) {
    console.error('TickTick OAuth token exchange failed:', res.status, await res.text());
    const appUrl = process.env.APP_URL ?? 'https://corolla.jhosan.top';
    return c.redirect(`${appUrl}?ticktick=error`);
  }

  const data = await res.json() as {
    access_token: string; refresh_token: string; expires_in: number;
  };
  await storeOAuthTokens(OWNER_EMAIL(), data.access_token, data.refresh_token, data.expires_in);

  const appUrl = process.env.APP_URL ?? 'https://corolla.jhosan.top';
  return c.redirect(`${appUrl}?ticktick=connected`);
});

// Whether the owner has connected TickTick. No auth required — UI uses this to show status.
router.get('/ticktick/status', async (c) => {
  const connected = await isTickTickConnected(OWNER_EMAIL());
  return c.json({ connected });
});

// Fetch TickTick project list — for the project selector in settings.
router.get('/ticktick/projects', sessionMiddleware, async (c) => {
  try {
    const projects = await fetchTickTickProjects(OWNER_EMAIL());
    return c.json(projects);
  } catch (err) {
    console.error('TickTick project fetch error:', err);
    return c.json({ error: 'Failed to fetch projects' }, 502);
  }
});

// Disconnect — deletes stored tokens.
router.delete('/ticktick/disconnect', sessionMiddleware, async (c) => {
  await disconnectTickTick(OWNER_EMAIL());
  return c.json({ ok: true });
});

export default router;
