import type { Confidence, Explanation } from "@/lib/scoring/score";

/**
 * Full evidence trail for one flagged stock, labeled plainly — not raw
 * numbers dumped on screen (phase6.md task 3). This is the ONE place a
 * confidence label appears; the main digest stays free of it per spec.
 */
export default function WhyFlaggedDetail({
  explanation,
  confidence,
}: {
  explanation: Explanation;
  confidence: Confidence;
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
    <dl className="space-y-1.5 text-xs text-gray-600">
      {rows.map((row) => (
        <div key={row.label} className="flex gap-3">
          <dt className="w-32 shrink-0 font-medium text-gray-500">{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
