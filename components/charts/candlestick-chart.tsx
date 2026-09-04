"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import Skeleton from "@/components/ui/skeleton";

interface CandleBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

/**
 * Real OHLC candlestick chart, backed by /api/stocks/[symbol]/candles
 * (Yahoo chart data — see lib/market-data's getCandles). Renders nothing
 * fabricated: a symbol with no chart history shows an honest empty state
 * instead of synthetic bars.
 *
 * The chart's target <div> stays mounted across every state (just covered by
 * an overlay while loading/empty/error) — createChart() needs a real,
 * already-laid-out container, so the container can't be conditionally
 * rendered only once data is ready without deadlocking on itself.
 */
export default function CandlestickChart({
  symbol,
  days = 90,
  height = 220,
}: {
  symbol: string;
  days?: number;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    fetch(`/api/stocks/${encodeURIComponent(symbol)}/candles?days=${days}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as { bars: CandleBar[] };
      })
      .then(({ bars }) => {
        if (cancelled || !containerRef.current) return;
        if (bars.length === 0) {
          setState("empty");
          return;
        }

        const chart = createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height,
          layout: {
            background: { color: "transparent" },
            textColor: "rgba(255,255,255,0.45)",
            fontFamily: "var(--font-sans)",
            attributionLogo: false,
          },
          grid: {
            vertLines: { color: "rgba(255,255,255,0.04)" },
            horzLines: { color: "rgba(255,255,255,0.04)" },
          },
          rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
          timeScale: { borderColor: "rgba(255,255,255,0.08)" },
          crosshair: {
            vertLine: { color: "rgba(0,208,132,0.35)", labelBackgroundColor: "#00a568" },
            horzLine: { color: "rgba(0,208,132,0.35)", labelBackgroundColor: "#00a568" },
          },
        });
        chartRef.current = chart;

        const series = chart.addSeries(CandlestickSeries, {
          upColor: "#00d084",
          downColor: "#ff5c5c",
          borderVisible: false,
          wickUpColor: "#00d084",
          wickDownColor: "#ff5c5c",
        });

        series.setData(
          bars.map((b) => ({
            time: b.date as Time,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          })),
        );
        chart.timeScale().fitContent();
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const resize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (containerRef.current) chartRef.current?.applyOptions({ width: containerRef.current.clientWidth });
      }, 100);
    };
    window.addEventListener("resize", resize);

    return () => {
      cancelled = true;
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", resize);
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, [symbol, days, height]);

  return (
    <div className="relative w-full" style={{ height }}>
      <div ref={containerRef} className="absolute inset-0 overflow-hidden rounded-2xl" />
      {state === "loading" && <Skeleton style={{ height }} className="absolute inset-0 w-full" />}
      {state === "empty" && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl border border-white/5 bg-ink text-xs text-white/30">
          No chart history for {symbol} yet.
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl border border-down/15 bg-down/5 text-xs text-down/80">
          Couldn&apos;t load chart data.
        </div>
      )}
    </div>
  );
}
