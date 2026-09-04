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
import {
  computeMeaningfulness,
  deriveBucket,
  type Confidence,
  type Explanation,
  type MeaningfulnessResult,
} from "@/lib/scoring/score";
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

interface ExistingRow {
  id: string;
  meaningfulness_score: number | null;
  confidence: string | null;
  explanation: Json | null;
  thesis_verdict: string | null;
}

function extractThesisAnalysis(explanation: Json | null): ThesisAnalysisSummary | null {
  if (!explanation || typeof explanation !== "object" || Array.isArray(explanation)) return null;
  const ta = (explanation as Record<string, unknown>).thesis_analysis;
  if (!ta || typeof ta !== "object") return null;
  const t = ta as Record<string, unknown>;
  return {
    summary: typeof t.summary === "string" ? t.summary : "",
    signals: Array.isArray(t.signals) ? (t.signals as ThesisSignal[]) : [],
  };
}

/**
 * Scores every non-first-view diff and upserts change_events keyed on
 * (user_id, symbol, snapshot_id) — dedupe-by-snapshot, so reloading
 * /watchlist repeatedly doesn't spam duplicate rows for the same underlying
 * change (Phase 5 design decision).
 *
 * Phase 7 fix: this function runs on every diffs fetch, including the
 * client's 5s thesis-verdict poll (diff-panel.tsx). That poll happens
 * *after* markWatchlistSeen() has already advanced the user's seen pointer
 * to the snapshot just shown — so on the very next poll, computeDiffsForUser
 * sees "then === current" for that symbol and produces a 0%-delta diff. That
 * diff is still technically "scorable," and re-running computeMeaningfulness
 * on it would produce a different (near-zero, Routine-bucket) result than
 * the original detection — and upserting it would silently overwrite the
 * real change_events row with this phantom zero-delta record, both losing
 * historical accuracy AND demoting an Urgent/Notable card back to Routine
 * mid-session while the user is still watching it.
 *
 * The fix: once a change_events row already exists for a given
 * (symbol, snapshot_id), it is never recomputed or rewritten again — it is
 * simply read back and reused as-is (score/bucket/confidence/explanation/
 * thesis state all come straight from the persisted row). Only a diff whose
 * current snapshot has genuinely never been scored before goes through
 * computeMeaningfulness + upsert. This is what makes repeated polling safe:
 * a stock's detected change, once recorded, is immutable from this
 * function's point of view — exactly matching change_events' role as a
 * historical record.
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

  // Read back any change_events rows that already exist for the exact
  // (symbol, snapshot_id) pairs about to be considered — these are reused
  // untouched (see doc comment above) rather than recomputed.
  const existingByKey = new Map<string, ExistingRow>();
  const snapshotIds = [...new Set(scorable.map((d) => d.currentSnapshotId))];
  const { data: existingRows, error: existingError } = await supabase
    .from("change_events")
    .select("id, symbol, snapshot_id, meaningfulness_score, confidence, explanation, thesis_verdict")
    .eq("user_id", userId)
    .in("symbol", scorable.map((d) => d.symbol))
    .in("snapshot_id", snapshotIds);
  if (existingError) {
    console.error(`[computeAndPersistScores] existing-rows query failed: ${existingError.message}`);
  }
  for (const row of existingRows ?? []) {
    if (row.snapshot_id) {
      existingByKey.set(`${row.symbol}:${row.snapshot_id}`, row);
    }
  }

  const toScore = scorable.filter(
    (diff) => !existingByKey.has(`${diff.symbol}:${diff.currentSnapshotId}`),
  );

  // Reuse already-scored rows as-is — no recomputation, no re-upsert.
  for (const diff of scorable) {
    const existing = existingByKey.get(`${diff.symbol}:${diff.currentSnapshotId}`);
    if (!existing || existing.meaningfulness_score === null) continue;

    results.set(diff.symbol, {
      score: existing.meaningfulness_score,
      bucket: deriveBucket(existing.meaningfulness_score),
      confidence: (existing.confidence as Confidence | null) ?? "Low",
      explanation: existing.explanation as unknown as Explanation,
      changeEventId: existing.id,
      thesisVerdict: existing.thesis_verdict,
      thesisAnalysis: extractThesisAnalysis(existing.explanation),
    });
  }

  if (toScore.length === 0) return results;

  const symbols = toScore.map((d) => d.symbol);
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

  for (const diff of toScore) {
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

      rows.push({
        user_id: userId,
        symbol: diff.symbol,
        snapshot_id: diff.currentSnapshotId,
        meaningfulness_score: result.score,
        magnitude: diff.priceDeltaPct,
        confidence: result.confidence,
        explanation: result.explanation as unknown as Json,
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
      .select("id, symbol");
    if (error) {
      console.error(`[computeAndPersistScores] change_events upsert failed: ${error.message}`);
    }
    for (const row of upserted ?? []) {
      const existing = results.get(row.symbol);
      if (!existing) continue;
      results.set(row.symbol, { ...existing, changeEventId: row.id });
    }
  }

  return results;
}
