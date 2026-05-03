import { scrapeAll as scrapeBowdens } from './bowdens.js';
import { scrapeAutobarn } from './autobarn.js';
import { scrapeRepco } from './repco.js';
import { scrapeSupercheap } from './supercheap.js';

// Runs all scrapers sequentially and writes results to the local DB.
// Used by the in-process cron job and `npm run scrape`.
export async function scrapeAllRetailers(): Promise<void> {
  console.log('=== Bowden\'s Own ===');
  await scrapeBowdens();

  console.log('=== Auto Barn ===');
  await scrapeAutobarn();

  console.log('=== Repco ===');
  await scrapeRepco();

  console.log('=== Supercheap Auto ===');
  await scrapeSupercheap();
}

// Allow running directly: npm run scrape
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  scrapeAllRetailers().catch((err) => { console.error(err); process.exit(1); });
}
