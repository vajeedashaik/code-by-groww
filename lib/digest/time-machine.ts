import type { ScoredDiff } from "@/lib/watchlist/scored-diff";
import { interpretExplanation } from "@/lib/digest/interpret";
import { formatElapsed } from "@/lib/watchlist/format-elapsed";

/**
 * Plain-language "before vs after" summary for the Market Time Machine view
 * (phase8.md task 5). Pure — no I/O — reuses Phase 4's diff fields and
 * Phase 5/6's interpretation engine rather than computing anything new.
 */
export function buildTimeMachineSummary(diff: ScoredDiff): string {
  if (diff.isFirstView) {
    return "Nothing to compare yet — this is the first time this stock has been checked.";
  }

  const elapsedSuffix =
    diff.timeElapsedMs !== null ? ` (${formatElapsed(diff.timeElapsedMs)})` : "";
  const pct = diff.priceDeltaPct;
  const moveText =
    pct === null
      ? "No price change on record"
      : pct > 0
        ? `Up ${pct.toFixed(2)}%`
        : pct < 0
          ? `Down ${Math.abs(pct).toFixed(2)}%`
          : "Flat";

  const context = diff.explanation ? ` ${interpretExplanation(diff.explanation)}` : "";
  return `${moveText} since you last checked${elapsedSuffix}.${context}`;
}
