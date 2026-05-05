// GitHub Actions entry point — Bowden's Own variant products.
//
// Do not scrape Bowden's directly from GitHub Actions: runner IPs can receive HTTP
// 403 from Bowden's Maropost/Neto endpoint. This script triggers the Render backend,
// so the request runs in the same environment as the regular Bowden's cron.

const BACKEND_URL = process.env.BACKEND_URL ?? 'https://corolla-zr-maintenance-app.onrender.com';
const SCRAPE_SECRET = process.env.SCRAPE_SECRET ?? '';
const FORCE_SCRAPE = process.env.FORCE_SCRAPE === 'true';
const ROUTE = '/api/scrape/bowdens-variants';
const MAX_ATTEMPTS = 20;
const RETRY_DELAY_MS = 30_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== Bowden's Own (variant products) ===");
  console.log(`Triggering backend scrape at ${BACKEND_URL}${FORCE_SCRAPE ? ' (force refresh)' : ''}...`);

  let lastStatus = 0;
  let lastText = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const url = new URL(`${BACKEND_URL}${ROUTE}`);
    if (FORCE_SCRAPE) url.searchParams.set('force', 'true');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SCRAPE_SECRET}`,
      },
    });

    if (res.ok) {
      const data = await res.json() as {
        inserted: number;
        skipped: number;
        errors: number;
        details?: {
          slug: string;
          sku: string;
          status: 'inserted' | 'skipped' | 'error';
          reason?: string;
          priceCents?: number;
          onSale?: boolean;
        }[];
      };
      console.log(`Done. ${data.inserted} observations stored, ${data.skipped} skipped, ${data.errors} errors.`);
      for (const item of data.details ?? []) {
        const price = item.priceCents === undefined ? '' : ` $${(item.priceCents / 100).toFixed(2)}`;
        const reason = item.reason ? ` - ${item.reason}` : '';
        console.log(`  ${item.status}: ${item.slug}${price}${reason}`);
      }
      return;
    }

    lastStatus = res.status;
    lastText = await res.text();

    if (res.status === 404 && attempt < MAX_ATTEMPTS) {
      console.log(`Backend route not available yet (HTTP 404). Render may still be deploying; retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    break;
  }

  throw new Error(`POST ${ROUTE} failed: HTTP ${lastStatus} — ${lastText}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
