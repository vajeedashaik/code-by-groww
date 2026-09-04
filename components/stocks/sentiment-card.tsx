import type { NewsSentiment } from "@/lib/stocks/insights";
import GlassCard from "@/components/ui/glass-card";

export default function SentimentCard({ sentiment }: { sentiment: NewsSentiment }) {
  const hasSentiment = sentiment.bullishPercent !== null && sentiment.bearishPercent !== null;

  return (
    <GlassCard className="p-5">
      <p className="text-xs font-semibold tracking-wide text-white/45 uppercase">News sentiment</p>

      {hasSentiment ? (
        <>
          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/5">
            <span className="bg-up" style={{ width: `${(sentiment.bullishPercent ?? 0) * 100}%` }} />
            <span className="bg-down" style={{ width: `${(sentiment.bearishPercent ?? 0) * 100}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs">
            <span className="text-up">{((sentiment.bullishPercent ?? 0) * 100).toFixed(0)}% bullish</span>
            <span className="text-down">{((sentiment.bearishPercent ?? 0) * 100).toFixed(0)}% bearish</span>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-white/30">No sentiment score available for this symbol.</p>
      )}

      {sentiment.articlesInLastWeek !== null && (
        <p className="mt-4 text-xs text-white/35">
          {sentiment.articlesInLastWeek} article{sentiment.articlesInLastWeek === 1 ? "" : "s"} in the last week
          {sentiment.sectorAverageBullishPercent !== null && (
            <> — sector average bullishness {(sentiment.sectorAverageBullishPercent * 100).toFixed(0)}%</>
          )}
        </p>
      )}
    </GlassCard>
  );
}
