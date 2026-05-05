import { chromium, type BrowserContext } from 'playwright';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function createStealthContext(): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });
  const context = await browser.newContext({
    userAgent: UA,
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-AU,en;q=0.9',
    },
  });

  // Mask the most common bot-detection signals
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-AU', 'en'] });
    // @ts-ignore
    window.chrome = { runtime: {} };
  });

  return {
    context,
    close: () => browser.close(),
  };
}
