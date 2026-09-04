import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { filterNseFallback } from "@/lib/stocks/nse-fallback";
import type {
  StockSearchResponse,
  StockSearchResult,
} from "@/lib/stocks/types";

/**
 * GET /api/search?q=<query>
 *
 * Stock search for the watchlist add flow. Runs server-side so FINNHUB_API_KEY
 * never reaches the browser. Auth-gated — only signed-in users can spend our
 * Finnhub quota.
 *
 * Strategy: query Finnhub's /search and merge its hits with a locally-filtered
 * static NSE list (see lib/stocks/nse-fallback.ts for why the fallback exists).
 * If Finnhub is down / rate-limited / missing a key, we still return the
 * fallback matches plus an `error` flag so the UI can warn without breaking.
 */

const FINNHUB_SEARCH = "https://finnhub.io/api/v1/search";

interface FinnhubSearchItem {
  symbol: string;
  description: string;
  displaySymbol: string;
  type: string;
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = (
    new URL(request.url).searchParams.get("q") ?? ""
  ).trim();

  // Reject empty / whitespace-only queries early.
  if (query.length < 1) {
    return NextResponse.json({ results: [] } satisfies StockSearchResponse);
  }

  const fallback: StockSearchResult[] = filterNseFallback(query).map((s) => ({
    symbol: s.symbol,
    name: s.name,
    origin: "nse-fallback" as const,
  }));

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      results: fallback,
      error: "Search is running on the local list only (no API key configured).",
    } satisfies StockSearchResponse);
  }

  let finnhubResults: StockSearchResult[] = [];
  try {
    const res = await fetch(
      `${FINNHUB_SEARCH}?q=${encodeURIComponent(query)}&token=${apiKey}`,
      { signal: AbortSignal.timeout(6000), cache: "no-store" },
    );

    if (!res.ok) {
      return NextResponse.json({
        results: fallback,
        error:
          res.status === 429
            ? "Search is rate-limited right now — showing local matches only."
            : "Search is temporarily unavailable — showing local matches only.",
      } satisfies StockSearchResponse);
    }

    const data = (await res.json()) as { result?: FinnhubSearchItem[] };
    finnhubResults = (data.result ?? [])
      .filter((item) => item.type === "Common Stock" || item.type === "")
      .slice(0, 15)
      .map((item) => ({
        symbol: item.symbol,
        name: item.description || item.displaySymbol || item.symbol,
        origin: "finnhub" as const,
      }));
  } catch {
    return NextResponse.json({
      results: fallback,
      error: "Search is temporarily unavailable — showing local matches only.",
    } satisfies StockSearchResponse);
  }

  // Merge, de-duplicating by symbol. Fallback entries win on a tie because they
  // carry the clean Indian company name.
  const bySymbol = new Map<string, StockSearchResult>();
  for (const r of finnhubResults) bySymbol.set(r.symbol.toUpperCase(), r);
  for (const r of fallback) bySymbol.set(r.symbol.toUpperCase(), r);

  return NextResponse.json({
    results: [...bySymbol.values()].slice(0, 20),
  } satisfies StockSearchResponse);
}
