import type { BucketedDiffs } from "@/lib/digest/summarize";

export interface DigestStats {
  total: number;
  urgent: number;
  notable: number;
  routine: number;
  /** Nifty 50 change, read from any diff's explanation (same value on every diff scored in the same run). Null if nothing has been scored yet. */
  marketChangePct: number | null;
}

/** Pure aggregation over an already-bucketed digest — no fetching, no fabrication: null fields stay null. */
export function digestStats(bucketed: BucketedDiffs): DigestStats {
  const total =
    bucketed.urgent.length + bucketed.notable.length + bucketed.routine.length + bucketed.newlyAdded.length;

  const allScored = [...bucketed.urgent, ...bucketed.notable, ...bucketed.routine];
  const withMarket = allScored.find((b) => b.diff.explanation?.market_change_pct != null);

  return {
    total,
    urgent: bucketed.urgent.length,
    notable: bucketed.notable.length,
    routine: bucketed.routine.length,
    marketChangePct: withMarket?.diff.explanation?.market_change_pct ?? null,
  };
}

export interface SectorSnapshot {
  sector: string;
  changePct: number;
}

/** De-duplicated sector moves actually seen across today's scored diffs — real data only, never estimated for sectors with no scored stock. */
export function sectorSnapshot(bucketed: BucketedDiffs): SectorSnapshot[] {
  const allScored = [...bucketed.urgent, ...bucketed.notable, ...bucketed.routine];
  const bySector = new Map<string, number>();
  for (const { diff } of allScored) {
    const sector = diff.explanation?.sector_used;
    const pct = diff.explanation?.sector_change_pct;
    if (sector && pct != null && !bySector.has(sector)) {
      bySector.set(sector, pct);
    }
  }
  return [...bySector.entries()]
    .map(([sector, changePct]) => ({ sector, changePct }))
    .sort((a, b) => b.changePct - a.changePct);
}
