"use client";

import type { BucketedItem } from "@/lib/digest/summarize";
import StockCard from "@/components/digest/stock-card";
import RoutineLine from "@/components/digest/routine-line";

const TONE_CLASSES: Record<"urgent" | "notable" | "routine", string> = {
  urgent: "text-red-700",
  notable: "text-amber-700",
  routine: "text-gray-500",
};

/**
 * One collapsible bucket section. Urgent/Notable render StockCard (full
 * detail); Routine renders RoutineLine (compact) — the "attention
 * rationing" thesis made visible via native <details>, no custom JS state
 * (phase6.md: "not cosmetic," no animations beyond basic functional ones).
 * Renders nothing when there are no items in this bucket.
 */
export default function BucketSection({
  title,
  tone,
  items,
  defaultOpen,
  variant,
}: {
  title: string;
  tone: "urgent" | "notable" | "routine";
  items: BucketedItem[];
  defaultOpen: boolean;
  variant: "card" | "compact";
}) {
  if (items.length === 0) return null;

  return (
    <details open={defaultOpen}>
      <summary className={`cursor-pointer text-sm font-semibold uppercase tracking-wide ${TONE_CLASSES[tone]}`}>
        {title} ({items.length})
      </summary>
      <div className={variant === "card" ? "space-y-3 pt-3" : "space-y-1 pt-2"}>
        {items.map(({ item, diff }) =>
          variant === "card" ? (
            <StockCard key={item.symbol} item={item} diff={diff} />
          ) : (
            <RoutineLine key={item.symbol} item={item} diff={diff} />
          ),
        )}
      </div>
    </details>
  );
}
