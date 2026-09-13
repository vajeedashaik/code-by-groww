/**
 * Currency inference for display formatting. market_snapshots/daily_history
 * store raw prices with no currency column — the only signal available at
 * render time is the ticker's own suffix (NSE tickers carry .NS/.BO, US
 * tickers are bare — see lib/market-data/sources/yahoo.ts).
 */

const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function isIndianSymbol(symbol: string): boolean {
  return /\.(NS|BO)$/i.test(symbol);
}

/** Formats `value` in the currency implied by `symbol`'s exchange suffix. */
export function formatPrice(symbol: string, value: number): string {
  return isIndianSymbol(symbol) ? INR_FORMATTER.format(value) : USD_FORMATTER.format(value);
}
