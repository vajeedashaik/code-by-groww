/**
 * Picks the latest market_snapshots row per symbol from a batch of rows
 * (already filtered to the relevant symbols). On an equal fetched_at,
 * prefers the yahoo row — mirrors the tie-break rule in
 * app/(protected)/watchlist/page.tsx's local latestSnapshotBySymbol, which
 * doesn't select `id` and so can't be reused directly for seen-state writes.
 */
export interface LatestSnapshot {
  id: string;
  symbol: string;
  price: number;
  volume: number | null;
  source: string;
  fetched_at: string;
  /** Phase 8 dual-source reconciliation fields — optional so callers that don't select them (e.g. markWatchlistSeen) still type-check. */
  conflict?: boolean;
  alt_source?: string | null;
  alt_price?: number | null;
}

export function latestSnapshotWithIdBySymbol(
  rows: LatestSnapshot[],
): Map<string, LatestSnapshot> {
  const map = new Map<string, LatestSnapshot>();
  for (const r of rows) {
    const cur = map.get(r.symbol);
    if (
      !cur ||
      r.fetched_at > cur.fetched_at ||
      (r.fetched_at === cur.fetched_at && r.source === "yahoo")
    ) {
      map.set(r.symbol, r);
    }
  }
  return map;
}
