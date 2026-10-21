// GitHub Actions entry point, used by both scrape.yml (daily) and scrape-supercheap-tuesday.yml
// (Super Saver Tuesday sale window). Runs the Supercheap scraper (Playwright-based, needs a
// GitHub Actions runner), collects observations, then POSTs them to the Render backend.
//
// Auto Barn is scraped separately by scrape-autobarn.yml on the self-hosted runner. Repco,
// Autopro and Bowden's Own are retired (bot-blocked); see docs/blocked-retailers.md.
//
// Product/retailer-URL rows come from the live backend (fetchRowsFromBackend), not the local
// DB — this runner's local SQLite is a throwaway schema-only file with no access to products
// or retailer URLs added via the Products tab.

import { scrapeToArray as scrapeSupercheap } from './supercheap.js';
import { fetchRowsFromBackend } from './fetch-backend-rows.js';

const BACKEND_URL = process.env.BACKEND_URL ?? 'https://corolla.jhosan.top';
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
      Authorization: `Bearer ${SCRAPE_SECRET}`,
    },
    body: JSON.stringify(results),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /api/prices failed: HTTP ${res.status} — ${text}`);
  }

  const data = (await res.json()) as { inserted: number; skipped: number };
  console.log(`Done. ${data.inserted} observations stored, ${data.skipped} skipped.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
