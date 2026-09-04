import "server-only";
import { MarketDataError } from "@/lib/market-data/types";
import type { DailyBar, MarketDataSource, Quote } from "@/lib/market-data/types";

/**
 * Secondary market-data source. Reuses the FINNHUB_API_KEY already configured
 * in Phase 2 for search. Two jobs here:
 *   1. Quote US-listed symbols if any get added (yahoo still also covers them).
 *   2. Be a genuine second opinion for symbols both sources support, so the
 *      cross-source conflict logic in Phase 5+ has real disagreeing data to
 *      work with — not faked conflicts.
 *
 * Finnhub's free tier does NOT quote Indian equities and its daily-candle
 * endpoint (/stock/candle) is paid. So `supports()` is US-only (no .NS/.BO
 * suffix) and `getDailyHistory` always declines — yahoo is the history source.
 */

const QUOTE_URL = "https://finnhub.io/api/v1/quote";
const TIMEOUT_MS = 6000;

function hasIndianSuffix(symbol: string): boolean {
  return /\.(NS|BO)$/i.test(symbol);
}

interface FinnhubQuote {
  c: number; // current price
  v?: number; // volume (often absent on free tier)
}

export const finnhubSource: MarketDataSource = {
  name: "finnhub",

  supports(symbol: string): boolean {
    return Boolean(process.env.FINNHUB_API_KEY) && !hasIndianSuffix(symbol);
  },

  async getQuote(symbol: string): Promise<Quote> {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      throw new MarketDataError("SOURCE_ERROR", symbol, "finnhub", "no api key");
    }

    let res: Response;
    try {
      res = await fetch(`${QUOTE_URL}?symbol=${encodeURIComponent(symbol)}`, {
        // Header, not query string: keeps the key out of any logged
        // `error.cause` (which carries the request URL).
        headers: { "X-Finnhub-Token": apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      throw new MarketDataError(
        timedOut ? "TIMEOUT" : "SOURCE_ERROR",
        symbol,
        "finnhub",
        err instanceof Error ? err.message : undefined,
        { cause: err },
      );
    }

    if (res.status === 429) {
      throw new MarketDataError("RATE_LIMIT", symbol, "finnhub");
    }
    if (!res.ok) {
      throw new MarketDataError(
        "SOURCE_ERROR",
        symbol,
        "finnhub",
        `HTTP ${res.status}`,
      );
    }

    let data: FinnhubQuote;
    try {
      const parsed = (await res.json()) as FinnhubQuote;
      if (typeof parsed.c !== "number" || parsed.c === 0) {
        // Finnhub returns c:0 for unknown symbols.
        throw new MarketDataError("NOT_FOUND", symbol, "finnhub");
      }
      data = parsed;
    } catch (err) {
      // Deliberate NOT_FOUND above must propagate untouched; a non-JSON 200
      // body or a body stream aborted by the timeout throws a raw
      // SyntaxError / DOMException here — map those to SOURCE_ERROR so only
      // MarketDataError ever crosses this boundary.
      if (err instanceof MarketDataError) throw err;
      throw new MarketDataError(
        "SOURCE_ERROR",
        symbol,
        "finnhub",
        err instanceof Error ? err.message : String(err),
        { cause: err },
      );
    }

    return {
      symbol: symbol.trim().toUpperCase(),
      price: data.c,
      volume: typeof data.v === "number" ? data.v : null,
      source: "finnhub",
      fetchedAt: new Date(),
    };
  },

  async getDailyHistory(symbol: string): Promise<DailyBar[]> {
    // Paid endpoint on the free tier — declined by design.
    throw new MarketDataError(
      "SOURCE_ERROR",
      symbol,
      "finnhub",
      "daily history not available on the Finnhub free tier",
    );
  },
};
