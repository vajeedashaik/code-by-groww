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
  // Deliberately muted, not the full-saturation green/red used on
  // Urgent/Notable cards (StockCard) — Routine items carry less attention
  // weight by design (phase6.md's "not a noisy dashboard" thesis).
  const pctColor = pct === null || pct === 0 ? "text-white/35" : "text-white/60";
  const pctLabel =
    pct === null ? "no change" : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%`;

  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <span className="text-white/75">{item.symbol}</span>
      <span className={`tabular-nums ${pctColor}`}>{pctLabel}</span>
    </div>
  );
}
