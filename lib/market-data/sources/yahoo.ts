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
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new MarketDataError("TIMEOUT", symbol, source)),
        TIMEOUT_MS,
      ),
    ),
  ]);
}

function toMarketDataError(err: unknown, symbol: string): MarketDataError {
  if (err instanceof MarketDataError) return err;
  const msg = err instanceof Error ? err.message : String(err);
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
        symbol: symbol.toUpperCase(),
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
          symbol: symbol.toUpperCase(),
          date: r.date.toISOString().slice(0, 10),
          close: r.close,
          volume: typeof r.volume === "number" ? r.volume : null,
        }));
      if (rows.length === 0) {
        throw new MarketDataError("NOT_FOUND", symbol, "yahoo", "no history");
      }
      return rows;
    } catch (err) {
      throw toMarketDataError(err, symbol);
    }
  },
};
