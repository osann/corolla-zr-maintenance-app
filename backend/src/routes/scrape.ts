import { Hono } from 'hono';
import { scrapeVariants } from '../scrapers/bowdens-playwright.js';

const router = new Hono();

function isAuthorized(authHeader: string | undefined): boolean {
  const secret = process.env.SCRAPE_SECRET;
  return Boolean(secret && authHeader === `Bearer ${secret}`);
}

// POST /api/scrape/bowdens-variants
// Triggers the Bowden's variant scraper on the backend host. This avoids GitHub
// Actions runner IPs, which can receive HTTP 403 from Bowden's Neto endpoint.
router.post('/scrape/bowdens-variants', async (c) => {
  if (!isAuthorized(c.req.header('Authorization'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const result = await scrapeVariants();
  return c.json({ ok: true, ...result });
});

export default router;
