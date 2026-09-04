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
import type { ThesisSignal } from "@/lib/thesis/types";

function closesOf(bars: HistoryBar[]): number[] {
  return bars.map((b) => b.close);
}
function volumesOf(bars: HistoryBar[]): (number | null)[] {
  return bars.map((b) => b.volume);
}

/** Minimal view of a stored ThesisAnalysis — just what the digest UI needs to render. */
export interface ThesisAnalysisSummary {
  summary: string;
  signals: ThesisSignal[];
}

/** MeaningfulnessResult plus the change_events row identity and Phase 7 thesis state the diffs route needs. */
export interface ScoreWithMeta extends MeaningfulnessResult {
  /** null when the upsert failed or this diff had nothing to score — never eligible for a thesis check. */
  changeEventId: string | null;
  /** The change event's current thesis_verdict. null until Phase 7's Inngest job sets it. */
  thesisVerdict: string | null;
  /** null until a verdict has been persisted for this change event. */
  thesisAnalysis: ThesisAnalysisSummary | null;
}

/**
 * Scores every non-first-view diff and upserts change_events keyed on
 * (user_id, symbol, snapshot_id) — dedupe-by-snapshot, so reloading
 * /watchlist repeatedly doesn't spam duplicate rows for the same underlying
 * change (Phase 5 design decision). Returns a Map so the diffs route can
 * merge results into its response without a second DB read.
 *
 * Phase 7: this function runs on every diffs fetch, including the client's
 * thesis-verdict poll (see diff-panel.tsx). Re-upserting `explanation` with
 * only the Phase 5 fields would silently erase any `thesis_analysis` the
 * thesis-relevance Inngest job already wrote into that same jsonb column —
 * so existing rows for the exact (symbol, snapshot_id) pairs being upserted
 * are read first, and any existing `thesis_analysis` is carried forward into
 * the new explanation object before writing. The upsert's own `.select()`
 * then returns that preserved value straight back, so ScoreWithMeta.
 * thesisAnalysis always reflects current DB state without a second read.
 *
 * Note: if the change_events upsert fails, this still returns the in-memory
 * computed scores (logged, not thrown) — a caller should not assume a score
 * in the returned Map was durably persisted (changeEventId will be null in
 * that case). Also: any single diff whose inputs cause computeMeaningfulness
 * to throw (non-finite data) is logged and skipped, not fatal to the batch —
 * same partial-failure contract as the Inngest snapshot/history jobs.
 */
export async function computeAndPersistScores(
  supabase: SupabaseClient<Database>,
  userId: string,
  diffs: SymbolDiff[],
): Promise<Map<string, ScoreWithMeta>> {
  const results = new Map<string, ScoreWithMeta>();

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

  // Pre-fetch existing rows for the exact (symbol, snapshot_id) pairs about
  // to be upserted, so any Phase 7 thesis_analysis already written isn't
  // clobbered by this call's Phase 5 explanation write (see doc comment).
  const existingExplanationByKey = new Map<string, Json>();
  const snapshotIds = [...new Set(scorable.map((d) => d.currentSnapshotId))];
  const { data: existingRows, error: existingError } = await supabase
    .from("change_events")
    .select("symbol, snapshot_id, explanation")
    .eq("user_id", userId)
    .in("symbol", symbols)
    .in("snapshot_id", snapshotIds);
  if (existingError) {
    console.error(`[computeAndPersistScores] existing-rows query failed: ${existingError.message}`);
  }
  for (const row of existingRows ?? []) {
    if (row.snapshot_id && row.explanation) {
      existingExplanationByKey.set(`${row.symbol}:${row.snapshot_id}`, row.explanation);
    }
  }

  const rows: Database["public"]["Tables"]["change_events"]["Insert"][] = [];

  for (const diff of scorable) {
    try {
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

      results.set(diff.symbol, {
        ...result,
        changeEventId: null,
        thesisVerdict: null,
        thesisAnalysis: null,
      });

      const existingExplanation = existingExplanationByKey.get(`${diff.symbol}:${diff.currentSnapshotId}`);
      const existingThesisAnalysis =
        existingExplanation && typeof existingExplanation === "object" && !Array.isArray(existingExplanation)
          ? (existingExplanation as Record<string, Json | undefined>).thesis_analysis
          : undefined;

      const explanation: Json =
        existingThesisAnalysis !== undefined
          ? ({
              ...(result.explanation as unknown as Record<string, Json>),
              thesis_analysis: existingThesisAnalysis,
            } as Json)
          : (result.explanation as unknown as Json);

      rows.push({
        user_id: userId,
        symbol: diff.symbol,
        snapshot_id: diff.currentSnapshotId,
        meaningfulness_score: result.score,
        magnitude: diff.priceDeltaPct,
        confidence: result.confidence,
        explanation,
      });
    } catch (err) {
      // One symbol's bad/non-finite data must not take down every other
      // symbol's score — same "log and skip, never fatal" contract as
      // snapshot-ingest.ts / daily-history-backfill.ts.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[computeAndPersistScores] skipped ${diff.symbol}: ${message}`);
    }
  }

  if (rows.length > 0) {
    const { data: upserted, error } = await supabase
      .from("change_events")
      .upsert(rows, { onConflict: "user_id,symbol,snapshot_id" })
      .select("id, symbol, thesis_verdict, explanation");
    if (error) {
      console.error(`[computeAndPersistScores] change_events upsert failed: ${error.message}`);
    }
    for (const row of upserted ?? []) {
      const existing = results.get(row.symbol);
      if (!existing) continue;

      let thesisAnalysis: ThesisAnalysisSummary | null = null;
      if (row.explanation && typeof row.explanation === "object" && !Array.isArray(row.explanation)) {
        const ta = (row.explanation as Record<string, unknown>).thesis_analysis;
        if (ta && typeof ta === "object") {
          const t = ta as Record<string, unknown>;
          thesisAnalysis = {
            summary: typeof t.summary === "string" ? t.summary : "",
            signals: Array.isArray(t.signals) ? (t.signals as ThesisSignal[]) : [],
          };
        }
      }

      results.set(row.symbol, {
        ...existing,
        changeEventId: row.id,
        thesisVerdict: row.thesis_verdict,
        thesisAnalysis,
      });
    }
  }

  return results;
}
