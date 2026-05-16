import { Hono } from 'hono';

const router = new Hono();

type DayForecast = { date: string; rain_chance: number; temp_max: number };

// In-memory cache: postcode → { forecast, fetchedAt }
const cache = new Map<string, { forecast: DayForecast[]; fetchedAt: number }>();
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

// GET /weather?postcode=3000 — returns 7-day forecast via Open-Meteo (no API key, no IP restrictions)
router.get('/weather', async (c) => {
  const postcode = c.req.query('postcode') ?? '';
  if (!/^\d{4}$/.test(postcode)) return c.json(null);

  const cached = cache.get(postcode);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return c.json(cached.forecast);
  }

  try {
    // Step 1: geocode the Australian postcode to lat/lon
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(postcode)}&count=1&countryCode=AU&language=en&format=json`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!geoRes.ok) return c.json(null);

    const geoData = (await geoRes.json()) as { results?: { latitude: number; longitude: number }[] };
    const loc = geoData?.results?.[0];
    if (!loc) return c.json(null);

    // Step 2: fetch 7-day daily forecast
    const fcRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=precipitation_probability_max,temperature_2m_max&timezone=auto&forecast_days=7`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!fcRes.ok) return c.json(null);

    const fcData = (await fcRes.json()) as {
      daily?: { time: string[]; precipitation_probability_max: number[]; temperature_2m_max: number[] };
    };
    const d = fcData?.daily;
    if (!d?.time?.length) return c.json(null);

    const forecast: DayForecast[] = d.time.map((date, i) => ({
      date,
      rain_chance: d.precipitation_probability_max[i] ?? 0,
      temp_max: d.temperature_2m_max[i] ?? 0,
    }));

    cache.set(postcode, { forecast, fetchedAt: Date.now() });
    return c.json(forecast);
  } catch {
    return c.json(null);
  }
});

export default router;
