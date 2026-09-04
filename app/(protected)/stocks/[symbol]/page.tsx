import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCompanyInsights } from "@/lib/stocks/insights";
import { latestSnapshotWithIdBySymbol } from "@/lib/watchlist/snapshots";
import IntervalChart from "@/components/stocks/interval-chart";
import CompanyHeader from "@/components/stocks/company-header";
import KeyMetricsGrid from "@/components/stocks/key-metrics-grid";
import AnalystRatingsChart from "@/components/stocks/analyst-ratings-chart";
import SentimentCard from "@/components/stocks/sentiment-card";
import InsightsUnavailable from "@/components/stocks/insights-unavailable";
import GlassCard from "@/components/ui/glass-card";

export const dynamic = "force-dynamic";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

function percentChange(price: number, prevClose: number | null): number | null {
  if (prevClose === null || prevClose === 0) return null;
  return ((price - prevClose) / prevClose) * 100;
}

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.trim().toUpperCase();
  if (!symbol) notFound();

  const supabase = createServerSupabaseClient();
  const [{ data: snapRows }, { data: histRows }, insights] = await Promise.all([
    supabase
      .from("market_snapshots")
      .select("id, symbol, price, volume, source, fetched_at")
      .eq("symbol", symbol)
      .order("fetched_at", { ascending: false })
      .limit(10),
    supabase
      .from("daily_history")
      .select("close, date")
      .eq("symbol", symbol)
      .order("date", { ascending: false })
      .limit(1),
    getCompanyInsights(symbol),
  ]);

  const latest = latestSnapshotWithIdBySymbol(snapRows ?? []).get(symbol);
  const prevClose = histRows?.[0]?.close ?? null;
  const pct = latest ? percentChange(latest.price, prevClose) : null;
  const pctColor = pct === null ? "text-white/35" : pct >= 0 ? "text-up text-glow-up" : "text-down text-glow-down";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/watchlist"
          className="text-sm text-white/45 underline decoration-white/20 underline-offset-4 hover:text-white/80"
        >
          Back to watchlist
        </Link>
      </div>

      <GlassCard className="flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <h1 className="font-display text-3xl font-semibold text-white">{symbol}</h1>
          {insights.profile?.name && <p className="mt-1 text-sm text-white/45">{insights.profile.name}</p>}
        </div>
        {latest && (
          <div className="text-right">
            <div className="font-display text-2xl font-semibold tabular-nums text-white">
              {inr.format(latest.price)}
            </div>
            {pct !== null && (
              <div className={`text-sm tabular-nums ${pctColor}`}>
                {pct >= 0 ? "+" : "−"}
                {Math.abs(pct).toFixed(2)}%
              </div>
            )}
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <IntervalChart symbol={symbol} />
      </GlassCard>

      {insights.profile && <CompanyHeader profile={insights.profile} symbol={symbol} />}

      {insights.available ? (
        <>
          {insights.metrics && <KeyMetricsGrid metrics={insights.metrics} />}
          <div className="grid gap-4 lg:grid-cols-2">
            <AnalystRatingsChart ratings={insights.analystRatings} />
            {insights.sentiment && <SentimentCard sentiment={insights.sentiment} />}
          </div>
        </>
      ) : (
        <InsightsUnavailable reason={insights.unavailableReason ?? "No data available."} />
      )}
    </div>
  );
}
