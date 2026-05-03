export function isOnSale(
  priceCents: number,
  compareAtPriceCents: number | null,
  rollingAvgCents: number | null,
): boolean {
  if (compareAtPriceCents !== null && compareAtPriceCents > priceCents) return true;
  if (rollingAvgCents !== null && priceCents < rollingAvgCents * 0.85) return true;
  return false;
}
