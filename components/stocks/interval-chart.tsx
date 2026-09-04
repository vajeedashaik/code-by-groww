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
      <div className="mb-4 flex items-center justify-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.label}
            type="button"
            onClick={() => setDays(r.days)}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
              days === r.days
                ? "clay-pulse border-transparent text-black"
                : "border-white/10 bg-white/[0.04] text-white/60 hover:border-white/20 hover:bg-white/[0.08] hover:text-white",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="mx-auto w-full max-w-3xl">
        <CandlestickChart key={days} symbol={symbol} days={days} height={420} />
      </div>
    </div>
  );
}
