import type { Explanation } from "@/lib/scoring/score";

/**
 * Ordered rule list, first match wins. Deliberately simple and readable as
 * one function — phase6.md's own manual step 2 expects these to be
 * hand-tuned against real change_events data, so keep it easy to edit.
 * Thresholds are named constants, not magic numbers, for the same reason.
 */
const HIGH_VOLUME_RATIO = 2;
const INDEPENDENT_MOVE_THRESHOLD_PP = 1;

function relativeMoves(explanation: Explanation): number[] {
  const moves: number[] = [];
  if (explanation.market_change_pct !== null) {
    moves.push(Math.abs(explanation.price_change_pct - explanation.market_change_pct));
  }
  if (explanation.sector_change_pct !== null) {
    moves.push(Math.abs(explanation.price_change_pct - explanation.sector_change_pct));
  }
  return moves;
}

export function interpretExplanation(explanation: Explanation): string {
  const { volume_ratio, market_change_pct, sector_change_pct } = explanation;

  if (market_change_pct === null && sector_change_pct === null) {
    return "Moved on its own — not enough comparison data yet.";
  }

  const moves = relativeMoves(explanation);
  const movedIndependently = moves.some((m) => m >= INDEPENDENT_MOVE_THRESHOLD_PP);
  const highVolume = volume_ratio !== null && volume_ratio >= HIGH_VOLUME_RATIO;

  if (highVolume && movedIndependently) {
    return "Moved independently of the market on unusually high volume.";
  }
  if (highVolume) {
    return "Broad move on unusually high volume — the whole market/sector moved with it.";
  }
  if (movedIndependently) {
    return "Moved independently of its sector and the broader market.";
  }
  return "Mostly tracked the broader market.";
}
