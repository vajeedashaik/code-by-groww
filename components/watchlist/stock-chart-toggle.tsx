"use client";

import { useState } from "react";
import CandlestickChart from "@/components/charts/candlestick-chart";

/** Inline chart reveal for a watchlist row — same lazy-mount pattern as StockCard's Chart toggle. */
export default function StockChartToggle({ symbol }: { symbol: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-white/35 transition-colors hover:text-pulse"
      >
        {open ? "Hide chart" : "Chart"}
      </button>
      {open && (
        <div className="mt-2 max-w-md">
          <CandlestickChart symbol={symbol} height={160} />
        </div>
      )}
    </div>
  );
}
