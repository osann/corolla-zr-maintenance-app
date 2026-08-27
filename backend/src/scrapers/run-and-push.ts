// GitHub Actions entry point.
// Runs the Supercheap scraper (Playwright-based, needs a GitHub Actions runner),
// collects observations, then POSTs them to the Render backend.
//
// Repco is NOT scraped here — as of ~2026-08-16 their product pages return HTTP 403 with a
// Cloudflare bot-management challenge (`Cf-Mitigated: challenge`) on every request, including
// from a plain curl and from residential IPs, not just GitHub Actions' cloud IPs. Confirmed
// 2026-08-27. Same class of block as Bowden's Own (see below) — not something a Playwright
// stealth context can talk its way past. repco.ts is left in place (not deleted) in case
// Repco's WAF config changes again, but is no longer called from this automated path. Every
// product tracked via Repco also has a Supercheap/Auto Barn/Autopro URL, so this doesn't drop
// any product to zero price coverage.
//
// Bowden's Own is scraped by the Render backend's internal cron job (cloud IPs blocked by Bowden's).
// Auto Barn is scraped by a separate workflow (scrape-autobarn.yml) timed to its crawl window.
//
// Product/retailer-URL rows come from the live backend (fetchRowsFromBackend), not the local
// DB — this runner's local SQLite is freshly re-seeded from the static seed.ts catalogue on
// every run, so it never sees products or retailer URLs added later via the Products tab.

import { scrapeToArray as scrapeSupercheap } from './supercheap.js';
import { fetchRowsFromBackend } from './fetch-backend-rows.js';

const BACKEND_URL = process.env.BACKEND_URL ?? 'https://corolla-zr-maintenance-app.onrender.com';
const SCRAPE_SECRET = process.env.SCRAPE_SECRET ?? '';

async function main() {
  console.log('=== Supercheap Auto ===');
  const supercheapRows = await fetchRowsFromBackend(BACKEND_URL, 'supercheap');
  const results = await scrapeSupercheap(supercheapRows);

  console.log(`\nCollected ${results.length} price observations. Pushing to ${BACKEND_URL}...`);

  if (results.length === 0) {
    console.log('No observations to push — done.');
    return;
  }

  const res = await fetch(`${BACKEND_URL}/api/prices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SCRAPE_SECRET}`,
    },
    body: JSON.stringify(results),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /api/prices failed: HTTP ${res.status} — ${text}`);
  }

  const data = await res.json() as { inserted: number; skipped: number };
  console.log(`Done. ${data.inserted} observations stored, ${data.skipped} skipped.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
