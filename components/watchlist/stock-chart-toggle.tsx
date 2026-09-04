"use client";

import { useState } from "react";
import CandlestickChart from "@/components/charts/candlestick-chart";

/**
 * Inline chart reveal for a watchlist row — same lazy-mount pattern as
 * StockCard's Chart toggle, open by default so every stock lands with its
 * chart visible. The panel is a separate flex item (order-last + basis-full)
 * so it wraps onto its own full-width line below the button row and can be
 * centered independently of the button's own width.
 */
export default function StockChartToggle({ symbol }: { symbol: string }) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:border-pulse/30 hover:bg-white/[0.08] hover:text-pulse"
      >
        {open ? "Hide chart" : "Chart"}
      </button>
      {open && (
        <div className="order-last mt-3 w-full basis-full">
          <div className="mx-auto w-full max-w-xl">
            <CandlestickChart symbol={symbol} height={240} />
          </div>
        </div>
      )}
    </>
  );
}
