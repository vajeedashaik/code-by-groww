import type { Confidence, Explanation } from "@/lib/scoring/score";
import type { ThesisField } from "@/lib/thesis/types";

/**
 * Full evidence trail for one flagged stock, labeled plainly — not raw
 * numbers dumped on screen (phase6.md task 3). This is the ONE place a
 * confidence label appears; the main digest stays free of it per spec.
 *
 * Phase 7: when `thesis` has a resolved analysis (signals present), adds a
 * "Thesis analysis" subsection with the per-article/signal reasoning behind
 * the verdict shown on the card (phase7.md task 4's "expand ... to include
 * the per-article/signal reasoning").
 */
export default function WhyFlaggedDetail({
  explanation,
  confidence,
  thesis,
}: {
  explanation: Explanation;
  confidence: Confidence;
  thesis?: ThesisField | null;
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
    { label: "Confidence", value: confidence },
  ];

  return (
    <div className="space-y-3">
      <dl className="space-y-1.5 text-xs text-gray-600">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-3">
            <dt className="w-32 shrink-0 font-medium text-gray-500">{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {thesis && thesis.signals.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500">Thesis analysis</p>
          <ul className="mt-1 space-y-1.5 text-xs text-gray-600">
            {thesis.signals.map((s, i) => (
              <li key={i}>
                <span className="font-medium">{s.source}</span> ({s.assessment}) — {s.reasoning}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
