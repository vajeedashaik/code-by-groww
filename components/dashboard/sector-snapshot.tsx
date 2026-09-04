import type { SectorSnapshot } from "@/lib/digest/insights";
import GlassCard from "@/components/ui/glass-card";

/** Ranked sector moves seen across today's scored watchlist — real per-stock sector benchmarks, never estimated. */
export default function SectorSnapshotCard({ sectors }: { sectors: SectorSnapshot[] }) {
  if (sectors.length === 0) return null;
  const max = Math.max(...sectors.map((s) => Math.abs(s.changePct)), 1);

  return (
    <GlassCard className="p-5">
      <p className="text-xs font-semibold tracking-wide text-white/45 uppercase">Sector snapshot</p>
      <div className="mt-3 space-y-2.5">
        {sectors.map((s) => {
          const up = s.changePct >= 0;
          const width = Math.min(100, (Math.abs(s.changePct) / max) * 100);
          return (
            <div key={s.sector} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 truncate text-white/65">{s.sector}</span>
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                <span
                  className={`absolute inset-y-0 left-0 rounded-full ${up ? "bg-up" : "bg-down"}`}
                  style={{ width: `${width}%` }}
                />
              </span>
              <span className={`w-16 shrink-0 text-right tabular-nums ${up ? "text-up" : "text-down"}`}>
                {up ? "+" : "−"}
                {Math.abs(s.changePct).toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
