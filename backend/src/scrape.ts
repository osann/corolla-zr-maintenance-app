import { scrapeAll } from './scrapers/bowdens.js';

scrapeAll().catch((err) => { console.error(err); process.exit(1); });
