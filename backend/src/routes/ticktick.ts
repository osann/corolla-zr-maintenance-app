import { Hono } from 'hono';
import { sessionMiddleware, requireAdmin, generateToken, type AppEnv } from '../lib/auth.js';
import { storeOAuthTokens, fetchTickTickProjects, isTickTickConnected, disconnectTickTick } from '../lib/ticktick.js';
import { getOwnerEmail } from '../lib/email.js';

const router = new Hono<AppEnv>();

const CLIENT_ID = () => process.env.TICKTICK_CLIENT_ID!;
const CLIENT_SECRET = () => process.env.TICKTICK_CLIENT_SECRET!;
const REDIRECT_URI = () => `${process.env.BACKEND_PUBLIC_URL}/api/ticktick/callback`;
const AUTH_URL = 'https://ticktick.com/oauth/authorize';
const TOKEN_URL = 'https://ticktick.com/oauth/token';

// OAuth `state` values handed out by /ticktick/auth → expiry (ms epoch). The callback arrives at
// Render directly, without the session cookie, so this is what proves the flow was started from
// the app rather than by someone authorising their own TickTick account against our client ID.
// In-memory like the magic-link cooldowns: a restart mid-flow only costs a retry.
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60_000;

// Redirect to TickTick OAuth. Admin only, since the tokens are stored against the owner account.
router.get('/ticktick/auth', sessionMiddleware, requireAdmin, (c) => {
  const now = Date.now();
  for (const [s, expiresAt] of pendingStates) if (expiresAt < now) pendingStates.delete(s);
  const state = generateToken();
  pendingStates.set(state, now + STATE_TTL_MS);

  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', CLIENT_ID());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', REDIRECT_URI());
  url.searchParams.set('scope', 'tasks:write tasks:read');
  url.searchParams.set('state', state);
  return c.redirect(url.toString());
});

// TickTick redirects back here with ?code=...&state=...
router.get('/ticktick/callback', async (c) => {
  const appUrl = process.env.APP_URL ?? 'https://corolla.jhosan.top';

  const state = c.req.query('state') ?? '';
  const stateExpiresAt = pendingStates.get(state);
  pendingStates.delete(state);
  if (!stateExpiresAt || stateExpiresAt < Date.now()) {
    console.error('TickTick OAuth callback with a missing, unknown or expired state');
    return c.redirect(`${appUrl}?ticktick=error`);
  }

  const code = c.req.query('code');
  if (!code) return c.text('Missing code', 400);

  const creds = Buffer.from(`${CLIENT_ID()}:${CLIENT_SECRET()}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI(),
    }),
  });

  if (!res.ok) {
    console.error('TickTick OAuth token exchange failed:', res.status, await res.text());
    return c.redirect(`${appUrl}?ticktick=error`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  await storeOAuthTokens(getOwnerEmail(), data.access_token, data.refresh_token, data.expires_in);

  return c.redirect(`${appUrl}?ticktick=connected`);
});

// Whether TickTick is connected. Only the admin has a connection, so anyone else sees false.
router.get('/ticktick/status', sessionMiddleware, async (c) => {
  if (!c.var.isAdmin) return c.json({ connected: false });
  const connected = await isTickTickConnected(getOwnerEmail());
  return c.json({ connected });
});

// Fetch TickTick project list — for the project selector in settings.
router.get('/ticktick/projects', sessionMiddleware, requireAdmin, async (c) => {
  try {
    const projects = await fetchTickTickProjects(getOwnerEmail());
    return c.json(projects);
  } catch (err) {
    console.error('TickTick project fetch error:', err);
    return c.json({ error: 'Failed to fetch projects' }, 502);
  }
});

// Disconnect — deletes stored tokens.
router.delete('/ticktick/disconnect', sessionMiddleware, requireAdmin, async (c) => {
  await disconnectTickTick(getOwnerEmail());
  return c.json({ ok: true });
});

export default router;
