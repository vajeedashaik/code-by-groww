import type { BucketedItem } from "@/lib/digest/summarize";
import GlassCard from "@/components/ui/glass-card";
import Badge from "@/components/ui/badge";

/** Lightweight list of first-view symbols — nothing to score yet (phase6.md task 1). */
export default function NewlyAddedSection({ items }: { items: BucketedItem[] }) {
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-white/45 uppercase">
        Newly added <Badge>{items.length}</Badge>
      </h2>
      <GlassCard className="divide-y divide-white/5 px-4">
        {items.map(({ item }) => (
          <div key={item.symbol} className="flex items-baseline gap-2 py-2.5 text-sm">
            <span className="font-medium text-white/85">{item.symbol}</span>
            {item.companyName && <span className="truncate text-white/45">{item.companyName}</span>}
            <span className="ml-auto shrink-0 text-xs text-white/30">First time viewing</span>
          </div>
        ))}
      </GlassCard>
    </div>
  );
}
