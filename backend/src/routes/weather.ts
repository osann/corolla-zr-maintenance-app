import { Hono } from 'hono';

const router = new Hono();

// In-memory cache: postcode → { forecast, fetchedAt }
const cache = new Map<string, { forecast: unknown[]; fetchedAt: number }>();
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

// GET /weather?postcode=3000 — proxy to BOM daily forecast API
router.get('/weather', async (c) => {
  const postcode = c.req.query('postcode') ?? '';
  if (!/^\d{4}$/.test(postcode)) return c.json(null);

  const cached = cache.get(postcode);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return c.json(cached.forecast);
  }

  try {
    const locRes = await fetch(
      `https://api.weather.bom.gov.au/v1/locations?q=${encodeURIComponent(postcode)}`,
      {
        headers: { Accept: 'application/json', 'User-Agent': 'corolla-detailing/1.0 (personal; joh.10@pm.me)' },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!locRes.ok) return c.json(null);

    const locData = (await locRes.json()) as { data?: { geohash?: string }[] };
    const geohash = locData?.data?.[0]?.geohash;
    if (!geohash) return c.json(null);

    const fcRes = await fetch(
      `https://api.weather.bom.gov.au/v1/locations/${geohash}/forecasts/daily`,
      {
        headers: { Accept: 'application/json', 'User-Agent': 'corolla-detailing/1.0 (personal; joh.10@pm.me)' },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!fcRes.ok) return c.json(null);

    const fcData = (await fcRes.json()) as { data?: unknown[] };
    const forecast = Array.isArray(fcData?.data) ? fcData.data : null;
    if (!forecast) return c.json(null);

    cache.set(postcode, { forecast, fetchedAt: Date.now() });
    return c.json(forecast);
  } catch {
    return c.json(null);
  }
});

export default router;
