import type { KeyMetrics } from "@/lib/stocks/insights";
import GlassCard from "@/components/ui/glass-card";

function fmt(value: number | null, opts?: { pct?: boolean; decimals?: number }): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const decimals = opts?.decimals ?? 2;
  return opts?.pct ? `${value.toFixed(decimals)}%` : value.toFixed(decimals);
}

// Finnhub's free tier only covers US-listed symbols (see lib/stocks/insights.ts), so these are always USD.
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export default function KeyMetricsGrid({ metrics }: { metrics: KeyMetrics }) {
  const tiles: { label: string; value: string }[] = [
    { label: "P/E ratio (TTM)", value: fmt(metrics.peTTM) },
    { label: "EPS (TTM)", value: metrics.epsTTM !== null ? usd.format(metrics.epsTTM) : "—" },
    { label: "52-week high", value: metrics.week52High !== null ? usd.format(metrics.week52High) : "—" },
    { label: "52-week low", value: metrics.week52Low !== null ? usd.format(metrics.week52Low) : "—" },
    { label: "Net margin (TTM)", value: fmt(metrics.netMarginTTM, { pct: true }) },
    { label: "Revenue growth (YoY)", value: fmt(metrics.revenueGrowthTTM, { pct: true }) },
    { label: "Dividend yield", value: fmt(metrics.dividendYieldTTM, { pct: true }) },
    { label: "Beta", value: fmt(metrics.beta) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <GlassCard key={t.label} className="px-4 py-3.5">
          <p className="text-xs text-white/40">{t.label}</p>
          <p className="font-display mt-1 text-lg font-semibold text-white">{t.value}</p>
        </GlassCard>
      ))}
    </div>
  );
}
