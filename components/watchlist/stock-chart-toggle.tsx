"use client";

import { useState } from "react";
import CandlestickChart from "@/components/charts/candlestick-chart";

/** Inline chart reveal for a watchlist row — same lazy-mount pattern as StockCard's Chart toggle. */
export default function StockChartToggle({ symbol }: { symbol: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:border-pulse/30 hover:bg-white/[0.08] hover:text-pulse"
      >
        {open ? "Hide chart" : "Chart"}
      </button>
      {open && (
        <div className="mx-auto mt-3 w-full max-w-xl">
          <CandlestickChart symbol={symbol} height={240} />
        </div>
      )}
    </div>
  );
}
