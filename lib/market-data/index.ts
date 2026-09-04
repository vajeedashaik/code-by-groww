import "server-only";
import { MarketDataError } from "@/lib/market-data/types";
import type { DailyBar, MarketDataSource, Quote } from "@/lib/market-data/types";
import { yahooSource } from "@/lib/market-data/sources/yahoo";
import { finnhubSource } from "@/lib/market-data/sources/finnhub";

/**
 * Public market-data facade. This is the ONLY module the rest of the app
 * imports for prices/history.
 *
 * Priority order: yahoo first (covers every symbol, no quota), finnhub second
 * (US symbols only, second opinion). `getQuote` returns the single best answer;
 * `getAllQuotes` returns every source that answered so US symbols accumulate a
 * genuine cross-source pair in market_snapshots.
 */

export type { Quote, DailyBar } from "@/lib/market-data/types";
export { MarketDataError } from "@/lib/market-data/types";
export type { MarketDataErrorCode } from "@/lib/market-data/types";

const SOURCES: MarketDataSource[] = [yahooSource, finnhubSource];

/**
 * Unreachable-in-practice sentinel: no configured source claims `symbol`. Kept
 * uniform across all three entry points so callers never have to special-case
 * one shape of "nothing to try".
 */
function noSourceError(symbol: string): MarketDataError {
  return new MarketDataError(
    "SOURCE_ERROR",
    symbol,
    "none",
    "no source supports this symbol",
  );
}

/** Best single quote for `symbol`. Throws MarketDataError if every source fails. */
export async function getQuote(symbol: string): Promise<Quote> {
  const usable = SOURCES.filter((s) => s.supports(symbol));
  let lastError: MarketDataError = noSourceError(symbol);
  for (const source of usable) {
    try {
      return await source.getQuote(symbol);
    } catch (err) {
      lastError =
        err instanceof MarketDataError
          ? err
          : new MarketDataError("SOURCE_ERROR", symbol, source.name);
    }
  }
  throw lastError;
}

/**
 * Every quote we can get for `symbol`, one per source that answered, plus any
 * per-source errors. Order follows SOURCES (yahoo first). The caller gets BOTH
 * the quotes and the errors so a job can fold partial failures into its run
 * summary: `errors` may be non-empty on success (a secondary source failed but
 * at least one succeeded). Each failure is also console.warn-logged here.
 * Throws only if NO source answered.
 */
export async function getAllQuotes(
  symbol: string,
): Promise<{ quotes: Quote[]; errors: MarketDataError[] }> {
  const usable = SOURCES.filter((s) => s.supports(symbol));
  const settled = await Promise.allSettled(
    usable.map((s) => s.getQuote(symbol)),
  );

  const quotes: Quote[] = [];
  const errors: MarketDataError[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      quotes.push(r.value);
    } else {
      const e =
        r.reason instanceof MarketDataError
          ? r.reason
          : new MarketDataError("SOURCE_ERROR", symbol, usable[i].name);
      errors.push(e);
      console.warn(
        `[market-data] ${usable[i].name} failed for ${symbol}: ${e.code}`,
      );
    }
  });

  if (quotes.length === 0) {
    throw errors[0] ?? noSourceError(symbol);
  }
  return { quotes, errors };
}

/**
 * Daily closes for `symbol` from the first source in priority order that can
 * answer (yahoo-only for now — Finnhub candles are paid). Throws the FIRST real
 * source error, not a later source's generic decline.
 */
export async function getDailyHistory(
  symbol: string,
  days: number,
): Promise<DailyBar[]> {
  let firstError: MarketDataError | undefined;
  for (const source of SOURCES) {
    if (!source.supports(symbol)) continue;
    try {
      return await source.getDailyHistory(symbol, days);
    } catch (err) {
      firstError ??=
        err instanceof MarketDataError
          ? err
          : new MarketDataError("SOURCE_ERROR", symbol, source.name);
    }
  }
  throw firstError ?? noSourceError(symbol);
}
