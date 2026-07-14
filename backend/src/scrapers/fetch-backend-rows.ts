// Fetches the current retailer-URL row list from the live backend, for scrapers running in an
// ephemeral environment (GitHub Actions hosted runner, self-hosted runner) with no direct
// database access. Those workflows only re-seed a throwaway local SQLite DB from the static
// seed.ts catalogue on every run — that has no visibility into products or retailer URLs added
// later via the Products tab UI (which writes straight to the production Turso DB). Fetching
// from the backend's own GET /api/products means the scraper always sees the live catalogue,
// including anything added since the last deploy.
export type ScrapeRow = { productId: number; url: string; slug: string; name: string };

interface BackendProduct {
  id: number;
  slug: string;
  name: string;
  urls?: Record<string, string>;
}

export async function fetchRowsFromBackend(backendUrl: string, retailer: string): Promise<ScrapeRow[]> {
  const res = await fetch(`${backendUrl}/api/products`);
  if (!res.ok) throw new Error(`Failed to fetch products from backend: HTTP ${res.status}`);
  const allProducts = await res.json() as BackendProduct[];
  return allProducts
    .filter((p) => p.urls?.[retailer])
    .map((p) => ({ productId: p.id, url: p.urls![retailer], slug: p.slug, name: p.name }));
}
