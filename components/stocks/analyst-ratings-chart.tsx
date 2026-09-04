import type { AnalystRatingPeriod } from "@/lib/stocks/insights";
import GlassCard from "@/components/ui/glass-card";

const SEGMENTS: { key: keyof Omit<AnalystRatingPeriod, "period">; label: string; className: string }[] = [
  { key: "strongBuy", label: "Strong buy", className: "bg-up" },
  { key: "buy", label: "Buy", className: "bg-up/50" },
  { key: "hold", label: "Hold", className: "bg-warn/60" },
  { key: "sell", label: "Sell", className: "bg-down/50" },
  { key: "strongSell", label: "Strong sell", className: "bg-down" },
];

/** Stacked bar per month — analyst buy/hold/sell counts, straight from Finnhub's recommendation trend, no scoring layered on top. */
export default function AnalystRatingsChart({ ratings }: { ratings: AnalystRatingPeriod[] }) {
  if (ratings.length === 0) return null;

  return (
    <GlassCard className="p-5">
      <p className="text-xs font-semibold tracking-wide text-white/45 uppercase">Analyst ratings</p>
      <div className="mt-4 space-y-3">
        {ratings.map((r) => {
          const total = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
          return (
            <div key={r.period}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-white/50">{r.period}</span>
                <span className="text-white/30">{total} analysts</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-white/5">
                {total > 0 &&
                  SEGMENTS.map((seg) => {
                    const value = r[seg.key];
                    if (value === 0) return null;
                    return (
                      <span
                        key={seg.key}
                        className={seg.className}
                        style={{ width: `${(value / total) * 100}%` }}
                        title={`${seg.label}: ${value}`}
                      />
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-white/35">
        {SEGMENTS.map((seg) => (
          <span key={seg.key} className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${seg.className}`} />
            {seg.label}
          </span>
        ))}
      </div>
    </GlassCard>
  );
}
