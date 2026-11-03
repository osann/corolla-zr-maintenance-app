import { fileURLToPath } from 'node:url';
import { scrapeAutobarn } from './autobarn.js';
import { scrapeBowdens } from './bowdens.js';
import { scrapeSupercheap } from './supercheap.js';

// Runs every active scraper sequentially and writes results to the local DB (`npm run scrape`).
// Local use only — production runs via run-and-push.ts (Supercheap), run-autobarn.ts and
// run-bowdens.ts. Repco and Autopro are retired; see docs/blocked-retailers.md.
export async function scrapeAllRetailers(): Promise<void> {
  console.log('=== Auto Barn ===');
  await scrapeAutobarn();

  console.log("=== Bowden's Own ===");
  await scrapeBowdens();

  console.log('=== Supercheap Auto ===');
  await scrapeSupercheap();
}

// Allow running directly: npm run scrape
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeAllRetailers().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
