// GitHub Actions entry point — Bowden's Own variant products.
//
// Delegates scraping to the Render backend via POST /api/scrape/bowdens-variants.
// Render's IPs are not Cloudflare-blocked by Bowden's, so the Neto API call works
// from there. Running Playwright from GitHub Actions fails because Cloudflare serves
// a JS challenge to GitHub Actions runner IPs.

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

  const data = await res.json() as { ok: boolean; inserted: number; skipped: number; errors: number };
  console.log(`Done. ${data.inserted} inserted, ${data.skipped} skipped, ${data.errors} errors.`);

  if (data.errors > 0) {
    throw new Error(`${data.errors} variant(s) failed to scrape — check Render logs for details.`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
