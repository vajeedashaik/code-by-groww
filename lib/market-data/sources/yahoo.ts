import "server-only";
import YahooFinance from "yahoo-finance2";
import { MarketDataError } from "@/lib/market-data/types";
import type { DailyBar, MarketDataSource, Quote } from "@/lib/market-data/types";

/**
 * Primary market-data source. yahoo-finance2 is an unofficial scraper of
 * Yahoo Finance's public JSON endpoints — no API key, no published quota. It
 * handles NSE tickers via the `.NS` suffix (RELIANCE.NS) and US tickers bare
 * (AAPL), so `supports()` is always true. It is the only history source in
 * Phase 3 (Finnhub candles are a paid endpoint).
 *
 * Trade-off: because it is unofficial it can break if Yahoo changes response
 * shapes. That is acceptable for a hackathon; the adapter isolates the blast
 * radius to this file.
 *
 * v4 API note: `yahoo-finance2@4` ships the client as a CLASS. You must
 * `new YahooFinance()` and call methods on the instance (the old namespace-
 * style `yahooFinance.quote(...)` default export is deprecated and throws).
 * The survey/notice banner is silenced with the `suppressNotices` constructor
 * option rather than a runtime method call.
 */

const yahooFinance = new YahooFinance({
  // Silence the first-run survey/notice banner in server logs.
  suppressNotices: ["yahooSurvey"],
});

const TIMEOUT_MS = 8000;

function withTimeout<T>(
  work: Promise<T>,
  symbol: string,
  source: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new MarketDataError("TIMEOUT", symbol, source)),
      TIMEOUT_MS,
    );
    // Don't let a pending timeout hold the event loop open / delay an Inngest
    // step return once `work` has already settled.
    timer.unref?.();
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

function toMarketDataError(err: unknown, symbol: string): MarketDataError {
  if (err instanceof MarketDataError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  // Yahoo is the primary source hit for every symbol every cycle — a 429 must
  // stay distinguishable, not collapse into SOURCE_ERROR.
  if (/429|too many requests|rate limit/i.test(msg)) {
    return new MarketDataError("RATE_LIMIT", symbol, "yahoo", msg, {
      cause: err,
    });
  }
  if (/not found|404|no data|delisted/i.test(msg)) {
    return new MarketDataError("NOT_FOUND", symbol, "yahoo", msg, { cause: err });
  }
  return new MarketDataError("SOURCE_ERROR", symbol, "yahoo", msg, {
    cause: err,
  });
}

export const yahooSource: MarketDataSource = {
  name: "yahoo",

  supports(): boolean {
    return true;
  },

  async getQuote(symbol: string): Promise<Quote> {
    try {
      const q = await withTimeout(yahooFinance.quote(symbol), symbol, "yahoo");
      const price = q?.regularMarketPrice;
      if (typeof price !== "number" || !Number.isFinite(price)) {
        throw new MarketDataError("NOT_FOUND", symbol, "yahoo", "no price");
      }
      const volume =
        typeof q.regularMarketVolume === "number" ? q.regularMarketVolume : null;
      return {
        symbol: symbol.trim().toUpperCase(),
        price,
        volume,
        source: "yahoo",
        fetchedAt: new Date(),
      };
    } catch (err) {
      throw toMarketDataError(err, symbol);
    }
  },

  async getDailyHistory(symbol: string, days: number): Promise<DailyBar[]> {
    const normSymbol = symbol.trim().toUpperCase();
    const period1 = new Date();
    period1.setDate(period1.getDate() - days);
    try {
      const result = await withTimeout(
        yahooFinance.chart(symbol, { period1, interval: "1d" }),
        symbol,
        "yahoo",
      );
      const rows = (result?.quotes ?? [])
        .filter(
          (r): r is typeof r & { date: Date; close: number } =>
            r.date instanceof Date &&
            typeof r.close === "number" &&
            Number.isFinite(r.close),
        )
        .map((r) => ({
          symbol: normSymbol,
          date: r.date.toISOString().slice(0, 10),
          close: r.close,
          volume: typeof r.volume === "number" ? r.volume : null,
        }));
      // Drop the in-progress bar: while the market is open Yahoo appends a
      // today-dated row whose `close` is the current intraday price. Task 10
      // would otherwise persist that as the day's official close.
      const today = new Date().toISOString().slice(0, 10);
      if (rows.length > 0 && rows[rows.length - 1].date === today) {
        rows.pop();
      }
      if (rows.length === 0) {
        throw new MarketDataError("NOT_FOUND", symbol, "yahoo", "no history");
      }
      return rows;
    } catch (err) {
      throw toMarketDataError(err, symbol);
    }
  },
};
