import { db } from '../db/connection.js';
import { users, userData } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';

const TICKTICK_API = 'https://api.ticktick.com/open/v1';
const TOKEN_URL    = 'https://ticktick.com/oauth/token';

interface StoredToken {
  access_token:  string;
  refresh_token: string;
  expires_at:    number; // ms epoch
}

export interface CreateTaskParams {
  title:     string;
  content?:  string;
  projectId: string;
  tags?:     string[];
  priority?: 0 | 1 | 3 | 5; // None/Low/Medium/High
  dueDate?:  string;         // ISO 8601, e.g. "2024-01-01T09:00:00+0000"
}

async function getOwnerUserId(ownerEmail: string): Promise<number | null> {
  const rows = await db.select({ id: users.id }).from(users)
    .where(eq(users.email, ownerEmail)).limit(1);
  return rows[0]?.id ?? null;
}

async function readStoredToken(userId: number): Promise<StoredToken | null> {
  const rows = await db.select({ valueJson: userData.valueJson })
    .from(userData)
    .where(and(eq(userData.userId, userId), eq(userData.key, 'ticktick-oauth-v1')))
    .limit(1);
  if (!rows[0]) return null;
  return JSON.parse(rows[0].valueJson) as StoredToken;
}

async function writeStoredToken(userId: number, token: StoredToken): Promise<void> {
  const json = JSON.stringify(token);
  const existing = await db.select({ id: userData.id }).from(userData)
    .where(and(eq(userData.userId, userId), eq(userData.key, 'ticktick-oauth-v1')))
    .limit(1);
  if (existing[0]) {
    await db.update(userData)
      .set({ valueJson: json, updatedAt: new Date().toISOString() })
      .where(and(eq(userData.userId, userId), eq(userData.key, 'ticktick-oauth-v1')));
  } else {
    await db.insert(userData).values({
      userId, key: 'ticktick-oauth-v1', valueJson: json,
      updatedAt: new Date().toISOString(),
    });
  }
}

async function refreshAccessToken(userId: number, stored: StoredToken): Promise<StoredToken> {
  const clientId     = process.env.TICKTICK_CLIENT_ID!;
  const clientSecret = process.env.TICKTICK_CLIENT_SECRET!;
  const creds        = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: stored.refresh_token }),
  });
  if (!res.ok) throw new Error(`TickTick token refresh failed: ${res.status}`);

  const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
  const updated: StoredToken = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token ?? stored.refresh_token,
    expires_at:    Date.now() + data.expires_in * 1000,
  };
  await writeStoredToken(userId, updated);
  return updated;
}

// Returns a valid access token, refreshing if within 24h of expiry. Throws if not connected.
export async function getValidToken(ownerEmail: string): Promise<string> {
  const userId = await getOwnerUserId(ownerEmail);
  if (!userId) throw new Error('Owner user not found');

  let stored = await readStoredToken(userId);
  if (!stored) throw new Error('TickTick not connected');

  const oneDay = 24 * 60 * 60 * 1000;
  if (Date.now() >= stored.expires_at - oneDay) {
    stored = await refreshAccessToken(userId, stored);
  }
  return stored.access_token;
}

export async function createTickTickTask(
  ownerEmail: string,
  params: CreateTaskParams,
): Promise<void> {
  const token = await getValidToken(ownerEmail);
  const res = await fetch(`${TICKTICK_API}/task`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`TickTick task creation failed: ${res.status}`);
}

export async function fetchTickTickProjects(ownerEmail: string): Promise<{ id: string; name: string }[]> {
  const token = await getValidToken(ownerEmail);
  const res = await fetch(`${TICKTICK_API}/project`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`TickTick project fetch failed: ${res.status}`);
  const data = await res.json() as { id: string; name: string }[];
  return data.map(p => ({ id: p.id, name: p.name }));
}

// Called from the OAuth callback to store initial tokens.
export async function storeOAuthTokens(
  ownerEmail: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
): Promise<void> {
  const userId = await getOwnerUserId(ownerEmail);
  if (!userId) throw new Error('Owner user not found');
  await writeStoredToken(userId, {
    access_token:  accessToken,
    refresh_token: refreshToken,
    expires_at:    Date.now() + expiresIn * 1000,
  });
}

// Returns whether the owner has stored TickTick tokens.
export async function isTickTickConnected(ownerEmail: string): Promise<boolean> {
  const userId = await getOwnerUserId(ownerEmail);
  if (!userId) return false;
  const stored = await readStoredToken(userId);
  return stored !== null;
}

export async function disconnectTickTick(ownerEmail: string): Promise<void> {
  const userId = await getOwnerUserId(ownerEmail);
  if (!userId) return;
  await db.delete(userData)
    .where(and(eq(userData.userId, userId), eq(userData.key, 'ticktick-oauth-v1')));
}
