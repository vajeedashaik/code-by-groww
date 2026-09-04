import type { WatchlistItemMeta } from "@/lib/digest/summarize";
import type { ScoredDiff } from "@/lib/watchlist/scored-diff";

/** Compact single line for a Routine stock — symbol + % change, nothing more (phase6.md task 2). */
export default function RoutineLine({
  item,
  diff,
}: {
  item: WatchlistItemMeta;
  diff: ScoredDiff;
}) {
  const pct = diff.priceDeltaPct;
  const pctColor =
    pct === null
      ? "text-gray-400"
      : pct > 0
        ? "text-green-600"
        : pct < 0
          ? "text-red-600"
          : "text-gray-500";
  const pctLabel =
    pct === null ? "no change" : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%`;

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-700">{item.symbol}</span>
      <span className={`tabular-nums ${pctColor}`}>{pctLabel}</span>
    </div>
  );
}
