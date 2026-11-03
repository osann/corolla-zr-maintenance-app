// Runs a scraper on the self-hosted runner and pushes its results to the backend as it goes. Used by
// run-autobarn.ts and run-bowdens.ts.
//
// Product/retailer-URL rows come from the live backend (fetchRowsFromBackend), not the local DB:
// the runner's local SQLite is schema-only, so it never sees products or URLs added later via the
// Products tab.
//
// The runner is a home machine whose runs can take an hour, and it has been seen to die mid-run
// (e.g. a runner-host SIGHUP). Pushing once at the very end would lose the whole day's prices.
// Instead it pushes every BATCH_SIZE products, so a crash loses at most the current partial batch.
import { fetchRowsFromBackend, type ScrapeRow } from './fetch-backend-rows.js';
import type { Retailer } from '../db/schema.js';
import type { PriceObservation } from '../routes/prices.js';

const BACKEND_URL = process.env.BACKEND_URL ?? 'https://corolla.jhosan.top';
const SCRAPE_SECRET = process.env.SCRAPE_SECRET ?? '';
const BATCH_SIZE = 10;

type Scrape = (onProduct: (obs: PriceObservation) => Promise<void>, rows: ScrapeRow[]) => Promise<PriceObservation[]>;

export async function scrapeAndPushInBatches(retailer: Retailer, label: string, scrape: Scrape): Promise<void> {
  console.log(`=== ${label} ===`);

  let batch: PriceObservation[] = [];
  let totalInserted = 0;
  let totalSkipped = 0;

  async function pushBatch(observations: PriceObservation[]): Promise<void> {
    const res = await fetch(`${BACKEND_URL}/api/prices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SCRAPE_SECRET}`,
      },
      body: JSON.stringify(observations),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`POST /api/prices failed: HTTP ${res.status} — ${text}`);
    }

    const data = (await res.json()) as { inserted: number; skipped: number };
    totalInserted += data.inserted;
    totalSkipped += data.skipped;
    console.log(`  → pushed batch of ${observations.length} (${data.inserted} inserted, ${data.skipped} skipped)`);
  }

  // On failure, the batch is left in place (not cleared) so it's retried — merged with whatever
  // accumulates next — at the following flush point instead of being silently dropped.
  async function flush(): Promise<void> {
    if (batch.length === 0) return;
    try {
      await pushBatch(batch);
      batch = [];
    } catch (err) {
      console.error(`  → batch push failed, will retry at next flush:`, (err as Error).message);
    }
  }

  const rows = await fetchRowsFromBackend(BACKEND_URL, retailer);
  try {
    await scrape(async (obs) => {
      batch.push(obs);
      if (batch.length >= BATCH_SIZE) await flush();
    }, rows);
  } finally {
    // Whatever was scraped before a failure still gets pushed.
    await flush();
  }

  console.log(`\nDone. ${totalInserted} observations stored, ${totalSkipped} skipped.`);
}
