import { createFetchScraper } from './fetch-scraper.js';

// Auto Barn robots.txt: Crawl-delay 10s, window 04:00–08:45 UTC.
// GitHub Actions IPs are blocked at the network level — runs via Render cron only.
const { scrapeToArray, scrapeAll: scrapeAutobarn } = createFetchScraper({
  retailer: 'autobarn',
  rateLimitMs: 15_000, // 10s per robots.txt, using 15s to reduce rate-limit risk
  cacheHours: 6,
  crawlWindow: { startHour: 4, endHour: 8, endMinute: 45 },
  ignoreWindowEnvVar: 'AUTOBARN_IGNORE_WINDOW',
});

export { scrapeToArray, scrapeAutobarn };