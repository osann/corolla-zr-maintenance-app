// GitHub Actions entry point for Auto Barn only.
// Runs within the robots.txt crawl window (04:00–08:45 UTC).
// A separate workflow triggers this at 05:00 UTC daily.

import { scrapeToArray as scrapeAutobarn } from './autobarn.js';

const BACKEND_URL = process.env.BACKEND_URL ?? 'https://corolla-zr-maintenance-app.onrender.com';
const SCRAPE_SECRET = process.env.SCRAPE_SECRET ?? '';

async function main() {
  console.log('=== Auto Barn ===');
  const results = await scrapeAutobarn();

  if (results.length === 0) {
    console.log('No observations to push — done.');
    return;
  }

  console.log(`\nCollected ${results.length} price observations. Pushing to ${BACKEND_URL}...`);

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
