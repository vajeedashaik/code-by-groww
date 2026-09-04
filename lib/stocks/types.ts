/** One stock search hit, shared by the /api/search route and its clients. */
export interface StockSearchResult {
  symbol: string;
  name: string;
  /** "finnhub" = live API, "nse-fallback" = static local list. */
  origin: "finnhub" | "nse-fallback";
}

export interface StockSearchResponse {
  results: StockSearchResult[];
  /**
   * Set when the external provider failed or was rate-limited. Results may
   * still contain fallback-list matches — the UI shows the warning but keeps
   * whatever it got.
   */
  error?: string;
}
