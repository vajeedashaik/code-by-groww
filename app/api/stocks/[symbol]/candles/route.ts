import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCandles, MarketDataError } from "@/lib/market-data";

/**
 * GET /api/stocks/[symbol]/candles?days=90
 *
 * Real OHLC bars for candlestick chart rendering — auth-gated read-only
 * proxy onto lib/market-data's getCandles (yahoo). Never touches
 * daily_history / scoring; purely a display-layer endpoint for the new
 * candlestick chart component.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol } = await params;
  const daysParam = Number(new URL(request.url).searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 90;

  try {
    const bars = await getCandles(symbol, days);
    return NextResponse.json({ symbol: symbol.toUpperCase(), bars });
  } catch (err) {
    const code = err instanceof MarketDataError ? err.code : "SOURCE_ERROR";
    const status = code === "NOT_FOUND" ? 404 : code === "RATE_LIMIT" ? 429 : 502;
    return NextResponse.json(
      { error: "Couldn't load chart data.", code },
      { status },
    );
  }
}
