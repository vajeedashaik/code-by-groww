/**
 * Shared vocabulary for the market-data adapter layer.
 *
 * ISOLATION BOUNDARY: everything outside lib/market-data/ (Inngest jobs, the
 * watchlist page, later scoring code) imports ONLY from lib/market-data. No
 * business code imports `yahoo-finance2` or calls finnhub.io directly — swapping
 * or adding a data source must never touch a consumer.
 */

/** A single point-in-time price reading from one source. */
export interface Quote {
  /** Normalized upper-case symbol, e.g. "RELIANCE.NS" or "AAPL". */
  symbol: string;
  price: number;
  /** null when the source does not report volume (e.g. Finnhub free tier). */
  volume: number | null;
  /** Which underlying source answered: "yahoo" | "finnhub". */
  source: string;
  /** When this reading was taken (adapter call time, not exchange time). */
  fetchedAt: Date;
}

/** One trading day's close for the history backfill. */
export interface DailyBar {
  symbol: string;
  /** ISO calendar date, "YYYY-MM-DD". */
  date: string;
  close: number;
  volume: number | null;
}

export type MarketDataErrorCode =
  | "NOT_FOUND" // symbol unknown to the source / no price data
  | "TIMEOUT" // the source did not answer within the budget
  | "RATE_LIMIT" // the source refused us for volume reasons (HTTP 429)
  | "SOURCE_ERROR"; // anything else (bad response, parse failure, 5xx)

/** The only error type the adapter throws. Consumers switch on `.code`. */
export class MarketDataError extends Error {
  readonly code: MarketDataErrorCode;
  readonly symbol: string;
  readonly source: string;

  constructor(
    code: MarketDataErrorCode,
    symbol: string,
    source: string,
    message?: string,
  ) {
    super(message ?? `${source}: ${code} for ${symbol}`);
    this.name = "MarketDataError";
    this.code = code;
    this.symbol = symbol;
    this.source = source;
  }
}

/** Contract every concrete source (yahoo, finnhub, …) implements. */
export interface MarketDataSource {
  readonly name: string;
  /** True if this source can be expected to answer for `symbol`. */
  supports(symbol: string): boolean;
  /** Throws MarketDataError on any failure. */
  getQuote(symbol: string): Promise<Quote>;
  /** `days` calendar days back from today. Throws MarketDataError on failure. */
  getDailyHistory(symbol: string, days: number): Promise<DailyBar[]>;
}
