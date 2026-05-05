// GitHub Actions entry point — Bowden's Own variant products.
//
// Do not scrape Bowden's directly from GitHub Actions: runner IPs can receive HTTP
// 403 from Bowden's Maropost/Neto endpoint. This script triggers the Render backend,
// so the request runs in the same environment as the regular Bowden's cron.

const BACKEND_URL = process.env.BACKEND_URL ?? 'https://corolla-zr-maintenance-app.onrender.com';
const SCRAPE_SECRET = process.env.SCRAPE_SECRET ?? '';

async function main() {
  console.log("=== Bowden's Own (variant products) ===");
  console.log(`Triggering backend scrape at ${BACKEND_URL}...`);

  const res = await fetch(`${BACKEND_URL}/api/scrape/bowdens-variants`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SCRAPE_SECRET}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /api/scrape/bowdens-variants failed: HTTP ${res.status} — ${text}`);
  }

  const data = await res.json() as { inserted: number; skipped: number; errors: number };
  console.log(`Done. ${data.inserted} observations stored, ${data.skipped} skipped, ${data.errors} errors.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
