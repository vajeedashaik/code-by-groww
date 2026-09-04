import type { DigestStats } from "@/lib/digest/insights";
import { NumberTicker } from "@/components/magicui/number-ticker";
import GlassCard from "@/components/ui/glass-card";

const TILES: {
  key: keyof Pick<DigestStats, "total" | "urgent" | "notable" | "routine">;
  label: string;
  dot: string;
}[] = [
  { key: "total", label: "Tracked", dot: "bg-white/30" },
  { key: "urgent", label: "Urgent", dot: "bg-down shadow-[0_0_8px_#ff5c5c]" },
  { key: "notable", label: "Notable", dot: "bg-warn shadow-[0_0_8px_#ffb020]" },
  { key: "routine", label: "Routine", dot: "bg-white/30" },
];

/** Top-of-dashboard KPI strip — counts only, all real (derived from the same bucketed digest the sections below render). */
export default function StatRow({ stats }: { stats: DigestStats }) {
  const marketUp = stats.marketChangePct !== null && stats.marketChangePct >= 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {TILES.map((t) => (
        <GlassCard key={t.key} className="px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-xs text-white/40">
            <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
            {t.label}
          </div>
          <div className="font-display mt-1 text-2xl font-semibold text-white">
            <NumberTicker value={stats[t.key]} />
          </div>
        </GlassCard>
      ))}
      <GlassCard className="px-4 py-3.5">
        <div className="flex items-center gap-1.5 text-xs text-white/40">
          <span className="h-1.5 w-1.5 rounded-full bg-pulse shadow-[0_0_8px_#00d084]" />
          Nifty 50
        </div>
        {stats.marketChangePct !== null ? (
          <div className={`font-display mt-1 text-2xl font-semibold tabular-nums ${marketUp ? "text-up" : "text-down"}`}>
            {marketUp ? "+" : "−"}
            <NumberTicker value={Math.abs(stats.marketChangePct)} decimalPlaces={2} />%
          </div>
        ) : (
          <div className="mt-1 text-2xl font-semibold text-white/20">—</div>
        )}
      </GlassCard>
    </div>
  );
}
