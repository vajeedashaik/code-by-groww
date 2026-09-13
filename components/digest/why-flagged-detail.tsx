import type { Confidence, Explanation } from "@/lib/scoring/score";
import type { ThesisField } from "@/lib/thesis/types";
import { formatPrice } from "@/lib/market-data/currency";

/**
 * Full evidence trail for one flagged stock, labeled plainly — not raw
 * numbers dumped on screen (phase6.md task 3). This is the ONE place a
 * confidence label appears; the main digest stays free of it per spec.
 *
 * Phase 7: when `thesis` has a resolved analysis (signals present), adds a
 * "Thesis analysis" subsection with the per-article/signal reasoning behind
 * the verdict shown on the card (phase7.md task 4's "expand ... to include
 * the per-article/signal reasoning").
 *
 * Phase 8: when `explanation.conflict` is true, adds a "Data conflict"
 * subsection naming both source values and the documented tie-break reason
 * (phase8.md task 3) — detail-level transparency, deliberately not surfaced
 * on the main digest card. When `explanation.stale` is true, the confidence
 * row itself gets a one-line note explaining why it reads "Low."
 */
export default function WhyFlaggedDetail({
  symbol,
  explanation,
  confidence,
  thesis,
  currentPrice,
  usedSource,
}: {
  symbol: string;
  explanation: Explanation;
  confidence: Confidence;
  thesis?: ThesisField | null;
  /** The price actually shown on the card — passed in rather than duplicated into Explanation, since the caller already has it. Used only for the Phase 8 conflict block. */
  currentPrice?: number | null;
  /** Which source that price came from (e.g. "yahoo"). */
  usedSource?: string | null;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "Price move", value: `${explanation.price_change_pct.toFixed(2)}%` },
    {
      label: "Price z-score",
      value: `${explanation.price_zscore.toFixed(2)}σ — standard deviations from this stock's normal daily move`,
    },
    {
      label: "Market comparison",
      value:
        explanation.market_change_pct !== null
          ? `Stock ${explanation.price_change_pct.toFixed(2)}% vs Nifty 50 ${explanation.market_change_pct.toFixed(2)}%`
          : "No market comparison available",
    },
    {
      label: "Sector comparison",
      value:
        explanation.sector_used !== null && explanation.sector_change_pct !== null
          ? `Stock ${explanation.price_change_pct.toFixed(2)}% vs ${explanation.sector_used} sector ${explanation.sector_change_pct.toFixed(2)}%`
          : "No sector mapping for this stock",
    },
    {
      label: "Volume",
      value:
        explanation.volume_ratio !== null
          ? `${explanation.volume_ratio.toFixed(1)}x normal volume`
          : "No volume comparison available",
    },
    {
      label: "Confidence",
      value: explanation.stale ? `${confidence} — price data is more than 10 minutes old` : confidence,
    },
  ];

  return (
    <div className="space-y-4">
      <dl className="space-y-2 text-xs text-white/60">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-3">
            <dt className="w-32 shrink-0 font-medium text-white/35">{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {explanation.conflict && (
        <div className="rounded-xl border border-warn/20 bg-warn/5 px-3 py-2.5">
          <p className="text-xs font-medium text-warn">Data conflict</p>
          <p className="mt-1 text-xs text-warn/80">
            The price sources disagreed:{" "}
            {usedSource ?? "the primary source"} reported{" "}
            {currentPrice != null ? formatPrice(symbol, currentPrice) : "a different value"}, while{" "}
            {explanation.alt_source ?? "the alternate source"} reported{" "}
            {explanation.alt_price !== null ? formatPrice(symbol, explanation.alt_price) : "a different value"}.
            We used {usedSource ?? "the primary source"}&apos;s price per our documented
            source-priority rule (Yahoo, then Finnhub) rather than averaging the two or hiding the
            disagreement.
          </p>
        </div>
      )}
      {thesis && thesis.signals.length > 0 && (
        <div>
          <p className="text-xs font-medium text-white/35">Thesis analysis</p>
          <ul className="mt-1.5 space-y-1.5 text-xs text-white/60">
            {thesis.signals.map((s, i) => (
              <li key={i}>
                <span className="font-medium text-white/80">{s.source}</span> ({s.assessment}) — {s.reasoning}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
