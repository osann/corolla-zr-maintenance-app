import { chromium, type BrowserContext } from 'playwright';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function createStealthContext(): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: UA,
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-AU,en;q=0.9',
    },
  });
  return {
    context,
    close: () => browser.close(),
  };
}
