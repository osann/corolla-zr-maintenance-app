// GitHub Actions entry point.
// Runs Auto Barn, Repco, and Supercheap scrapers (not Bowden's — cloud IPs are blocked there),
// collects all observations, then POSTs them to the Render backend.
//
// Bowden's Own is scraped by the Render backend's internal cron job instead.

import { scrapeToArray as scrapeAutobarn } from './autobarn.js';
import { scrapeToArray as scrapeRepco } from './repco.js';
import { scrapeToArray as scrapeSupercheap } from './supercheap.js';

const BACKEND_URL = process.env.BACKEND_URL ?? 'https://corolla-zr-maintenance-app.onrender.com';
const SCRAPE_SECRET = process.env.SCRAPE_SECRET ?? '';

async function main() {
  console.log('=== Auto Barn ===');
  const autobarnResults = await scrapeAutobarn();

  console.log('=== Repco ===');
  const repcoResults = await scrapeRepco();

  console.log('=== Supercheap Auto ===');
  const supercheapResults = await scrapeSupercheap();

  const results = [...autobarnResults, ...repcoResults, ...supercheapResults];
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
