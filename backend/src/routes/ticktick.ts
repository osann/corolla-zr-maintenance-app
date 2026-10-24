import { Hono } from 'hono';
import { sessionMiddleware, generateToken, type AppEnv } from '../lib/auth.js';
import { storeOAuthTokens, fetchTickTickProjects, isTickTickConnected, disconnectTickTick } from '../lib/ticktick.js';

const router = new Hono<AppEnv>();

const CLIENT_ID = () => process.env.TICKTICK_CLIENT_ID!;
const CLIENT_SECRET = () => process.env.TICKTICK_CLIENT_SECRET!;
const REDIRECT_URI = () => `${process.env.BACKEND_PUBLIC_URL}/api/ticktick/callback`;
const AUTH_URL = 'https://ticktick.com/oauth/authorize';
const TOKEN_URL = 'https://ticktick.com/oauth/token';

// OAuth `state` values handed out by /ticktick/auth → who started the flow, and until when. The
// callback arrives at Render directly, without the session cookie, so this is the only way to know
// whose tokens they are. It also stops someone authorising their own TickTick account against our
// client ID and having it stored as someone else's. In-memory like the magic-link cooldowns: a
// restart mid-flow only costs a retry.
const pendingStates = new Map<string, { userId: number; expiresAt: number }>();
const STATE_TTL_MS = 10 * 60_000;

// Redirect to TickTick OAuth for the signed-in user.
router.get('/ticktick/auth', sessionMiddleware, (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json({ error: 'Unauthorised' }, 401);

  const now = Date.now();
  for (const [s, { expiresAt }] of pendingStates) if (expiresAt < now) pendingStates.delete(s);
  const state = generateToken();
  pendingStates.set(state, { userId, expiresAt: now + STATE_TTL_MS });

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
  const pending = pendingStates.get(state);
  pendingStates.delete(state);
  if (!pending || pending.expiresAt < Date.now()) {
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
  await storeOAuthTokens(pending.userId, data.access_token, data.refresh_token, data.expires_in);

  return c.redirect(`${appUrl}?ticktick=connected`);
});

// Whether the signed-in user has connected TickTick. Signed out counts as not connected.
router.get('/ticktick/status', sessionMiddleware, async (c) => {
  const userId = c.var.userId;
  return c.json({ connected: userId ? await isTickTickConnected(userId) : false });
});

// Fetch the user's TickTick project list — for the project selector in settings.
router.get('/ticktick/projects', sessionMiddleware, async (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json({ error: 'Unauthorised' }, 401);
  try {
    const projects = await fetchTickTickProjects(userId);
    return c.json(projects);
  } catch (err) {
    console.error('TickTick project fetch error:', err);
    return c.json({ error: 'Failed to fetch projects' }, 502);
  }
});

// Disconnect — deletes the user's stored tokens.
router.delete('/ticktick/disconnect', sessionMiddleware, async (c) => {
  const userId = c.var.userId;
  if (!userId) return c.json({ error: 'Unauthorised' }, 401);
  await disconnectTickTick(userId);
  return c.json({ ok: true });
});

export default router;
