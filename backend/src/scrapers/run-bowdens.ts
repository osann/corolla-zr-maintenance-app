// Self-hosted runner entry point for Bowden's Own (scrape-bowdens.yml, daily at 04:00 UTC, so it's
// done before Auto Barn starts on the same runner). Bowden's blocks cloud IPs, so this runs on the
// home machine; see push-in-batches.ts for how results reach the backend.
import { scrapeToArray } from './bowdens.js';
import { scrapeAndPushInBatches } from './push-in-batches.js';

scrapeAndPushInBatches('bowdens', "Bowden's Own", scrapeToArray).catch((err) => {
  console.error(err);
  process.exit(1);
});
