"use client";

import { useState } from "react";
import { useWatchlistDiffs } from "@/components/watchlist/diff-panel";
import { buildTimeMachineSummary } from "@/lib/digest/time-machine";
import { formatElapsed } from "@/lib/watchlist/format-elapsed";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function pctText(v: number | null): string {
  if (v === null) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`;
}

/**
 * "Last seen vs now" comparison for one symbol (phase8.md task 5). Reads
 * from the already-fetched WatchlistDiffsProvider context — same pattern as
 * DiffLine — so this adds no extra fetch and no new computation, purely a
 * presentation layer over Phase 4's diff + Phase 5's benchmark explanation.
 * A first-view stock (no prior seen-state) renders a plain "nothing to
 * compare yet" message instead of an empty/broken table.
 */
export default function TimeMachine({ symbol }: { symbol: string }) {
  const { diffs, loading } = useWatchlistDiffs();
  const [open, setOpen] = useState(false);

  if (loading || !diffs) return null;
  const diff = diffs.get(symbol);
  if (!diff) return null;

  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="w-fit cursor-pointer list-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:border-pulse/30 hover:bg-white/[0.08] hover:text-pulse">
        Market Time Machine
      </summary>
      {open &&
        (diff.isFirstView ? (
          <p className="mt-2 text-xs text-white/30">
            You&apos;re seeing {symbol} for the first time — nothing to compare yet.
          </p>
        ) : (
          <div className="mt-2 max-w-sm space-y-3 rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-xs">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-white/30">
                  <th className="pb-1.5 font-medium"></th>
                  <th className="pb-1.5 font-medium">
                    Last seen
                    {diff.timeElapsedMs !== null
                      ? ` (${formatElapsed(diff.timeElapsedMs)})`
                      : ""}
                  </th>
                  <th className="pb-1.5 font-medium">Now</th>
                </tr>
              </thead>
              <tbody className="text-white/60">
                <tr>
                  <td className="pr-3 font-medium text-white/40">Price</td>
                  <td>{diff.priceThen !== null ? inr.format(diff.priceThen) : "—"}</td>
                  <td>{diff.priceNow !== null ? inr.format(diff.priceNow) : "—"}</td>
                </tr>
                <tr>
                  <td className="pr-3 font-medium text-white/40">Volume</td>
                  <td>{diff.volumeThen !== null ? diff.volumeThen.toLocaleString("en-IN") : "—"}</td>
                  <td>{diff.volumeNow !== null ? diff.volumeNow.toLocaleString("en-IN") : "—"}</td>
                </tr>
                <tr>
                  <td className="pr-3 font-medium text-white/40">Sector move</td>
                  <td colSpan={2}>
                    {diff.explanation?.sector_used && diff.explanation.sector_change_pct !== null
                      ? `${diff.explanation.sector_used} ${pctText(diff.explanation.sector_change_pct)}`
                      : "No comparison data available"}
                  </td>
                </tr>
                <tr>
                  <td className="pr-3 font-medium text-white/40">Market move</td>
                  <td colSpan={2}>
                    {diff.explanation?.market_change_pct !== null &&
                    diff.explanation?.market_change_pct !== undefined
                      ? `Nifty 50 ${pctText(diff.explanation.market_change_pct)}`
                      : "No comparison data available"}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-white/70">{buildTimeMachineSummary(diff)}</p>
          </div>
        ))}
    </details>
  );
}
