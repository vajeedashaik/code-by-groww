/**
 * Pure meaningfulness scoring — no DB/API calls inside, unit-testable in
 * isolation (phase5.md task 4). All three z-scores share the same
 * denominator (the stock's own daily volatility), which is what makes them
 * directly comparable/combinable in one weighted sum without arbitrary
 * rescaling — see the Phase 5 design doc.
 */

export type Bucket = "Urgent" | "Notable" | "Routine";
export type Confidence = "Low" | "Medium" | "High";

export type DataCompleteness =
  | "full"
  | "no_sector"
  | "no_volume"
  | "no_sector_no_volume"
  | "no_volatility"
  | "no_volatility_no_sector"
  | "no_volatility_no_volume"
  | "no_volatility_no_sector_no_volume";

export interface Explanation {
  price_change_pct: number;
  price_zscore: number;
  volume_ratio: number | null;
  market_change_pct: number | null;
  sector_change_pct: number | null;
  sector_used: string | null;
  data_completeness: DataCompleteness;
  /** Phase 8: true when this diff's "now" snapshot was STALE at scoring time — confidence is forced to "Low" when true. */
  stale: boolean;
  /** Phase 8: true when the "now" snapshot's source disagreed with an alternate source beyond the documented threshold. */
  conflict: boolean;
  alt_source: string | null;
  alt_price: number | null;
}

export interface MeaningfulnessInput {
  priceDeltaPct: number;
  volumeNow: number | null;
  volumeAvgRecent: number | null;
  /** Null when fewer than 20 days of daily_history exist for this symbol. */
  dailyVolPct: number | null;
  /** Null only if the market benchmark itself has no usable data. */
  marketDeltaPct: number | null;
  /** Null when the symbol has no sector mapping, or the sector has no usable data. */
  sectorDeltaPct: number | null;
  sectorName: string | null;
  /** Phase 8: true when the "now" snapshot classified as STALE at scoring time. Forces confidence to "Low" — stale data is never scored as if it were reliable. Defaults to false. */
  isStale?: boolean;
  /** Phase 8: true when the "now" snapshot's source disagreed with an alternate source beyond the documented threshold. Defaults to false. */
  conflict?: boolean;
  altSource?: string | null;
  altPrice?: number | null;
}

export interface MeaningfulnessResult {
  score: number;
  bucket: Bucket;
  confidence: Confidence;
  explanation: Explanation;
}

/** Named, tunable weights — phase5.md task 6/manual step 2 is adjusting these. */
export const SCORE_WEIGHTS = {
  priceAnomaly: 0.4,
  volumeAnomaly: 0.2,
  marketRelative: 0.2,
  sectorRelative: 0.2,
} as const;

/** Named, tunable bucket thresholds — phase5.md manual step 3. Raw scale, not rescaled to 0-100. */
export const BUCKET_THRESHOLDS = {
  urgent: 2.0,
  notable: 0.8,
} as const;

/**
 * Exported separately (not just inlined in computeMeaningfulness) so
 * lib/scoring/compute-for-diffs.ts can derive a Bucket from an
 * already-persisted meaningfulness_score without re-running the full
 * computation — needed to reuse an existing change_events row unchanged
 * (Phase 7 fix: re-scoring an already-scored snapshot on every digest poll
 * was producing a different, wrong result — see compute-for-diffs.ts).
 */
export function deriveBucket(score: number): Bucket {
  return score >= BUCKET_THRESHOLDS.urgent
    ? "Urgent"
    : score >= BUCKET_THRESHOLDS.notable
      ? "Notable"
      : "Routine";
}

export function computeMeaningfulness(
  input: MeaningfulnessInput,
): MeaningfulnessResult {
  const {
    priceDeltaPct,
    volumeNow,
    volumeAvgRecent,
    dailyVolPct,
    marketDeltaPct,
    sectorDeltaPct,
    sectorName,
    isStale = false,
    conflict = false,
    altSource = null,
    altPrice = null,
  } = input;

  if (!Number.isFinite(priceDeltaPct)) {
    throw new Error(`computeMeaningfulness: priceDeltaPct must be finite, got ${priceDeltaPct}`);
  }
  if (dailyVolPct !== null && !Number.isFinite(dailyVolPct)) {
    throw new Error(`computeMeaningfulness: dailyVolPct must be finite or null, got ${dailyVolPct}`);
  }
  if (marketDeltaPct !== null && !Number.isFinite(marketDeltaPct)) {
    throw new Error(`computeMeaningfulness: marketDeltaPct must be finite or null, got ${marketDeltaPct}`);
  }
  if (sectorDeltaPct !== null && !Number.isFinite(sectorDeltaPct)) {
    throw new Error(`computeMeaningfulness: sectorDeltaPct must be finite or null, got ${sectorDeltaPct}`);
  }

  const volatilityAvailable = dailyVolPct !== null && dailyVolPct > 0;

  // Fallback (task 3): no volatility -> use raw % change directly, never divide by zero.
  const priceZScore = volatilityAvailable
    ? priceDeltaPct / dailyVolPct
    : priceDeltaPct;

  const marketRelativeZScore =
    marketDeltaPct === null
      ? 0
      : volatilityAvailable
        ? (priceDeltaPct - marketDeltaPct) / dailyVolPct
        : priceDeltaPct - marketDeltaPct;

  const hasSector = sectorDeltaPct !== null;
  const sectorRelativeZScore = !hasSector
    ? 0
    : volatilityAvailable
      ? (priceDeltaPct - sectorDeltaPct) / dailyVolPct
      : priceDeltaPct - sectorDeltaPct;

  const volumeRatio =
    volumeNow !== null && volumeAvgRecent !== null && volumeAvgRecent > 0
      ? volumeNow / volumeAvgRecent
      : null;
  // Only rewards volume SURGES — never penalizes below-average volume.
  const volumeComponent = volumeRatio !== null ? Math.max(0, volumeRatio - 1) : 0;

  const score =
    SCORE_WEIGHTS.priceAnomaly * priceZScore +
    SCORE_WEIGHTS.volumeAnomaly * volumeComponent +
    SCORE_WEIGHTS.marketRelative * marketRelativeZScore +
    SCORE_WEIGHTS.sectorRelative * sectorRelativeZScore;

  const bucket = deriveBucket(score);

  const hasVolume = volumeRatio !== null;
  const confidenceFromCompleteness: Confidence = !volatilityAvailable
    ? "Low"
    : hasSector && hasVolume
      ? "High"
      : "Medium";
  // Phase 8: a STALE "now" snapshot overrides everything else — a score
  // computed from data that's already known to be old must never read as
  // confidently as one computed from a fresh snapshot, regardless of how
  // complete the other inputs (volatility/sector/volume) happen to be.
  const confidence: Confidence = isStale ? "Low" : confidenceFromCompleteness;

  // Derived from the same three factors as `confidence` so the two can never
  // disagree (a prior version computed data_completeness from only
  // volatility+sector, which could read "full" next to a "Medium" confidence
  // when only volume was missing).
  const missing: string[] = [];
  if (!volatilityAvailable) missing.push("volatility");
  if (!hasSector) missing.push("sector");
  if (!hasVolume) missing.push("volume");
  const dataCompleteness = (
    missing.length === 0 ? "full" : `no_${missing.join("_no_")}`
  ) as DataCompleteness;

  return {
    score,
    bucket,
    confidence,
    explanation: {
      price_change_pct: priceDeltaPct,
      price_zscore: priceZScore,
      volume_ratio: volumeRatio,
      market_change_pct: marketDeltaPct,
      sector_change_pct: sectorDeltaPct,
      sector_used: hasSector ? sectorName : null,
      data_completeness: dataCompleteness,
      stale: isStale,
      conflict,
      alt_source: conflict ? altSource : null,
      alt_price: conflict ? altPrice : null,
    },
  };
}
