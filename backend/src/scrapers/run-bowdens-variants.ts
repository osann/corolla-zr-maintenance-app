// GitHub Actions entry point — Bowden's Own variant products (size selector required).
// Used by scrape-bowdens-variants.yml for products where plain fetch always returns
// the default size price and Playwright must click the correct size radio button.

import { scrapeVariantsToArray } from './bowdens-playwright.js';

const BACKEND_URL = process.env.BACKEND_URL ?? 'https://corolla-zr-maintenance-app.onrender.com';
const SCRAPE_SECRET = process.env.SCRAPE_SECRET ?? '';

async function main() {
  console.log("=== Bowden's Own (variant products) ===");
  const results = await scrapeVariantsToArray();
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
