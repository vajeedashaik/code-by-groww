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
  | "no_volatility"
  | "no_volatility_no_sector";

export interface Explanation {
  price_change_pct: number;
  price_zscore: number;
  volume_ratio: number | null;
  market_change_pct: number | null;
  sector_change_pct: number | null;
  sector_used: string | null;
  data_completeness: DataCompleteness;
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
  } = input;

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

  const bucket: Bucket =
    score >= BUCKET_THRESHOLDS.urgent
      ? "Urgent"
      : score >= BUCKET_THRESHOLDS.notable
        ? "Notable"
        : "Routine";

  const hasVolume = volumeRatio !== null;
  const confidence: Confidence = !volatilityAvailable
    ? "Low"
    : hasSector && hasVolume
      ? "High"
      : "Medium";

  const dataCompleteness: DataCompleteness = !volatilityAvailable
    ? hasSector
      ? "no_volatility"
      : "no_volatility_no_sector"
    : hasSector
      ? "full"
      : "no_sector";

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
    },
  };
}
