// Self-hosted runner entry point for Auto Barn (scrape-autobarn.yml, daily at 05:00 UTC, inside the
// robots.txt crawl window of 04:00–08:45 UTC). Auto Barn blocks cloud IPs, so this runs on the home
// machine; see push-in-batches.ts for how results reach the backend.
import { scrapeToArray } from './autobarn.js';
import { scrapeAndPushInBatches } from './push-in-batches.js';

scrapeAndPushInBatches('autobarn', 'Auto Barn', scrapeToArray).catch((err) => {
  console.error(err);
  process.exit(1);
});
