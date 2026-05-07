import { createFetchScraper } from './fetch-scraper.js';

// Autopro robots.txt: Crawl-delay 10s, window 04:00–08:45 UTC — same as Auto Barn.
// Assumed to block GitHub Actions IPs (same platform); runs via Render cron only.
// SKUs are identical to Auto Barn SKUs — seeded from the same autobarnSku field.
const { scrapeToArray, scrapeAll: scrapeAutopro } = createFetchScraper({
  retailer: 'autopro',
  rateLimitMs: 15_000,
  cacheHours: 6,
  crawlWindow: { startHour: 4, endHour: 8, endMinute: 45 },
  ignoreWindowEnvVar: 'AUTOPRO_IGNORE_WINDOW',
});

export { scrapeToArray, scrapeAutopro };