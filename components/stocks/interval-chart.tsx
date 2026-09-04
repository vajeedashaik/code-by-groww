"use client";

import { useState } from "react";
import CandlestickChart from "@/components/charts/candlestick-chart";
import { cn } from "@/lib/utils";

const RANGES: { label: string; days: number }[] = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
];

/** Candlestick chart with its own interval filter — the one bit of "smart filter" interactivity a raw embed wouldn't give you. */
export default function IntervalChart({ symbol }: { symbol: string }) {
  const [days, setDays] = useState(90);

  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.label}
            type="button"
            onClick={() => setDays(r.days)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              days === r.days ? "clay-pulse text-black" : "text-white/45 hover:bg-white/5 hover:text-white/80",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <CandlestickChart key={days} symbol={symbol} days={days} height={340} />
    </div>
  );
}
