// GitHub Actions entry point for Auto Barn only.
// Runs within the robots.txt crawl window (04:00–08:45 UTC).
// A separate workflow triggers this at 05:00 UTC daily.

import { scrapeToArray as scrapeAutobarn } from './autobarn.js';
import type { PriceObservation } from '../routes/prices.js';

const BACKEND_URL = process.env.BACKEND_URL ?? 'https://corolla-zr-maintenance-app.onrender.com';
const SCRAPE_SECRET = process.env.SCRAPE_SECRET ?? '';

// Auto Barn runs on a self-hosted runner (home machine) for 40–70+ minutes and has been
// observed to die mid-run (e.g. a runner-host SIGHUP). Pushing once at the very end means a
// crash loses every product scraped that day. Instead, push every BATCH_SIZE products so a
// mid-run failure only loses the current partial batch, not the whole run.
const BATCH_SIZE = 10;

let batch: PriceObservation[] = [];
let totalInserted = 0;
let totalSkipped = 0;

async function pushBatch(observations: PriceObservation[]): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/prices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SCRAPE_SECRET}`,
    },
    body: JSON.stringify(observations),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /api/prices failed: HTTP ${res.status} — ${text}`);
  }

  const data = await res.json() as { inserted: number; skipped: number };
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

async function main() {
  console.log('=== Auto Barn ===');

  await scrapeAutobarn(async (obs) => {
    batch.push(obs);
    if (batch.length >= BATCH_SIZE) await flush();
  });

  await flush();

  console.log(`\nDone. ${totalInserted} observations stored, ${totalSkipped} skipped.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
