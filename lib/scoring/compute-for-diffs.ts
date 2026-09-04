import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type { SymbolDiff } from "@/lib/watchlist/diff";
import {
  MARKET_BENCHMARK_SYMBOL,
  lookupSector,
  symbolsInSector,
} from "@/lib/market-data/sectors";
import { loadRecentHistory, type HistoryBar } from "@/lib/scoring/history";
import { computeVolatilityPct, computeAverageVolume } from "@/lib/scoring/volatility";
import { computeDailyMovePct, computeSectorBenchmarkPct } from "@/lib/scoring/benchmarks";
import { computeMeaningfulness, type MeaningfulnessResult } from "@/lib/scoring/score";

function closesOf(bars: HistoryBar[]): number[] {
  return bars.map((b) => b.close);
}
function volumesOf(bars: HistoryBar[]): (number | null)[] {
  return bars.map((b) => b.volume);
}

/**
 * Scores every non-first-view diff and upserts change_events keyed on
 * (user_id, symbol, snapshot_id) — dedupe-by-snapshot, so reloading
 * /watchlist repeatedly doesn't spam duplicate rows for the same underlying
 * change (Phase 5 design decision). Returns a Map so the diffs route can
 * merge results into its response without a second DB read.
 *
 * Skips: first-view diffs (nothing to score yet, phase5.md task 7) and any
 * diff with no currentSnapshotId (no snapshot exists yet to key the upsert
 * on).
 */
export async function computeAndPersistScores(
  supabase: SupabaseClient<Database>,
  userId: string,
  diffs: SymbolDiff[],
): Promise<Map<string, MeaningfulnessResult>> {
  const results = new Map<string, MeaningfulnessResult>();

  const scorable = diffs.filter(
    (d): d is SymbolDiff & { currentSnapshotId: string; priceDeltaPct: number } =>
      !d.isFirstView && d.currentSnapshotId !== null && d.priceDeltaPct !== null,
  );
  if (scorable.length === 0) return results;

  const symbols = scorable.map((d) => d.symbol);
  const sectorsNeeded = [
    ...new Set(symbols.map(lookupSector).filter((s): s is string => s !== null)),
  ];
  const sectorMemberSymbols = sectorsNeeded.flatMap(symbolsInSector);

  const allNeeded = [
    ...new Set([...symbols, MARKET_BENCHMARK_SYMBOL, ...sectorMemberSymbols]),
  ];
  const historyBySymbol = await loadRecentHistory(supabase, allNeeded);

  const marketDeltaPct = computeDailyMovePct(
    closesOf(historyBySymbol.get(MARKET_BENCHMARK_SYMBOL) ?? []),
  );

  const sectorDeltaBySector = new Map<string, number | null>();
  for (const sector of sectorsNeeded) {
    const memberCloses = symbolsInSector(sector).map((s) =>
      closesOf(historyBySymbol.get(s) ?? []),
    );
    sectorDeltaBySector.set(sector, computeSectorBenchmarkPct(memberCloses));
  }

  const rows: Database["public"]["Tables"]["change_events"]["Insert"][] = [];

  for (const diff of scorable) {
    const bars = historyBySymbol.get(diff.symbol) ?? [];
    const dailyVolPct = computeVolatilityPct(closesOf(bars));
    const volumeAvgRecent = computeAverageVolume(volumesOf(bars));
    const sectorName = lookupSector(diff.symbol);
    const sectorDeltaPct = sectorName
      ? (sectorDeltaBySector.get(sectorName) ?? null)
      : null;

    const result = computeMeaningfulness({
      priceDeltaPct: diff.priceDeltaPct,
      volumeNow: diff.volumeNow,
      volumeAvgRecent,
      dailyVolPct,
      marketDeltaPct,
      sectorDeltaPct,
      sectorName,
    });

    results.set(diff.symbol, result);
    rows.push({
      user_id: userId,
      symbol: diff.symbol,
      snapshot_id: diff.currentSnapshotId,
      meaningfulness_score: result.score,
      magnitude: diff.priceDeltaPct,
      confidence: result.confidence,
      // Explanation is a concrete interface (no index signature), while the
      // generated Insert type expects the generic Json union — the shapes
      // are structurally compatible (plain data, no functions/undefined),
      // so this is a safe representational cast, not a behavior change.
      explanation: result.explanation as unknown as Json,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from("change_events")
      .upsert(rows, { onConflict: "user_id,symbol,snapshot_id" });
    if (error) {
      console.error(`[computeAndPersistScores] change_events upsert failed: ${error.message}`);
    }
  }

  return results;
}
