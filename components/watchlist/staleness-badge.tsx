import { classifyStaleness } from "@/lib/market-data/staleness";
import { formatElapsed } from "@/lib/watchlist/format-elapsed";

/**
 * Surfaces Phase 3's staleness classification (phase8.md task 1). FRESH and
 * DELAYED render identically, in a neutral muted tone — nothing to escalate
 * about at those ages, and the product's own thesis is "calm, not anxious."
 * Only STALE gets a visually distinct, slightly warmer tone — still calm
 * wording ("may be a little out of date"), not a red alarm. No "use client"
 * — classifyStaleness/formatElapsed are pure, so this renders fine from
 * either a server component (PriceCell) or a client one (StockCard).
 */
export default function StalenessBadge({
  fetchedAt,
}: {
  fetchedAt: string | null | undefined;
}) {
  if (!fetchedAt) return null;

  const status = classifyStaleness(fetchedAt);
  const elapsed = formatElapsed(Date.now() - new Date(fetchedAt).getTime());

  if (status === "STALE") {
    return (
      <span className="inline-block rounded-full border border-warn/25 bg-warn/10 px-2 py-0.5 text-[11px] font-medium text-warn">
        Price may be a little out of date — updated {elapsed}
      </span>
    );
  }

  return <span className="text-[11px] text-white/30">updated {elapsed}</span>;
}
