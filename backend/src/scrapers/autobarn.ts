import { createFetchScraper } from './fetch-scraper.js';

// Auto Barn robots.txt: Crawl-delay 10s, window 04:00–08:45 UTC.
// Both GitHub Actions hosted runners and Render IPs are blocked (HTTP 403).
// Runs via the self-hosted runner on the home machine (residential IP).
// ~40–60% of product URLs consistently hang server-side regardless of method —
// Playwright fallback was tried but those URLs also timeout in the browser.
// HTTP-only gets ~16–18/40 products; the rest are covered by Autopro.
const { scrapeToArray, scrapeAll: scrapeAutobarn } = createFetchScraper({
  retailer: 'autobarn',
  homepageUrl: 'https://www.autobarn.com.au/',
  rateLimitMs: 20_000, // 10s per robots.txt, using 20s + jitter to reduce throttling
  cacheHours: 6,
  crawlWindow: { startHour: 4, endHour: 8, endMinute: 45 },
  ignoreWindowEnvVar: 'AUTOBARN_IGNORE_WINDOW',
});

export { scrapeToArray, scrapeAutobarn };