"use client";

import type { BucketedItem } from "@/lib/digest/summarize";
import StockCard from "@/components/digest/stock-card";
import RoutineLine from "@/components/digest/routine-line";
import Badge from "@/components/ui/badge";

const TONE_CLASSES: Record<"urgent" | "notable" | "routine", string> = {
  urgent: "text-down",
  notable: "text-warn",
  routine: "text-white/45",
};

const TONE_BADGE: Record<"urgent" | "notable" | "routine", "down" | "warn" | "neutral"> = {
  urgent: "down",
  notable: "warn",
  routine: "neutral",
};

const TONE_DOT: Record<"urgent" | "notable" | "routine", string> = {
  urgent: "bg-down shadow-[0_0_8px_#ff5c5c]",
  notable: "bg-warn shadow-[0_0_8px_#ffb020]",
  routine: "bg-white/30",
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
    <details open={defaultOpen} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold tracking-wide uppercase select-none">
        <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
        <span className={TONE_CLASSES[tone]}>{title}</span>
        <Badge tone={TONE_BADGE[tone]}>{items.length}</Badge>
        <svg
          className="ml-auto h-3.5 w-3.5 text-white/30 transition-transform duration-200 group-open:rotate-180"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </summary>
      <div className={variant === "card" ? "space-y-3 pt-4" : "glass mt-3 space-y-0 divide-y divide-white/5 rounded-2xl px-4"}>
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
