/**
 * Static fallback list of liquid NSE (National Stock Exchange of India) symbols.
 *
 * DELIBERATE TRADE-OFF, NOT AN OVERSIGHT:
 * Finnhub's free tier has poor coverage of Indian equities (NSE/BSE) — its
 * `/search` endpoint frequently returns nothing for well-known Indian names.
 * To keep the demo usable we filter this hand-curated list locally and merge
 * the matches with whatever Finnhub does return. Symbols use the Yahoo-style
 * `.NS` suffix, which is what Phase 3's price provider will expect.
 *
 * Edit this list freely to guarantee the companies you plan to demo with are
 * searchable. ~40 names spread across sectors.
 */

export interface StockRef {
  symbol: string;
  name: string;
}

export const NSE_FALLBACK_STOCKS: StockRef[] = [
  // IT / tech
  { symbol: "TCS.NS", name: "Tata Consultancy Services" },
  { symbol: "INFY.NS", name: "Infosys" },
  { symbol: "WIPRO.NS", name: "Wipro" },
  { symbol: "HCLTECH.NS", name: "HCL Technologies" },
  { symbol: "TECHM.NS", name: "Tech Mahindra" },
  { symbol: "LTIM.NS", name: "LTIMindtree" },
  // Banks / financials
  { symbol: "HDFCBANK.NS", name: "HDFC Bank" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank" },
  { symbol: "SBIN.NS", name: "State Bank of India" },
  { symbol: "KOTAKBANK.NS", name: "Kotak Mahindra Bank" },
  { symbol: "AXISBANK.NS", name: "Axis Bank" },
  { symbol: "BAJFINANCE.NS", name: "Bajaj Finance" },
  { symbol: "BAJAJFINSV.NS", name: "Bajaj Finserv" },
  { symbol: "SBICARD.NS", name: "SBI Cards and Payment Services" },
  // Energy / oil & gas / utilities
  { symbol: "RELIANCE.NS", name: "Reliance Industries" },
  { symbol: "ONGC.NS", name: "Oil & Natural Gas Corporation" },
  { symbol: "NTPC.NS", name: "NTPC" },
  { symbol: "POWERGRID.NS", name: "Power Grid Corporation of India" },
  { symbol: "COALINDIA.NS", name: "Coal India" },
  { symbol: "ADANIGREEN.NS", name: "Adani Green Energy" },
  // Auto
  { symbol: "MARUTI.NS", name: "Maruti Suzuki India" },
  { symbol: "TATAMOTORS.NS", name: "Tata Motors" },
  { symbol: "M&M.NS", name: "Mahindra & Mahindra" },
  { symbol: "EICHERMOT.NS", name: "Eicher Motors" },
  { symbol: "BAJAJ-AUTO.NS", name: "Bajaj Auto" },
  // FMCG / consumer
  { symbol: "HINDUNILVR.NS", name: "Hindustan Unilever" },
  { symbol: "ITC.NS", name: "ITC" },
  { symbol: "NESTLEIND.NS", name: "Nestle India" },
  { symbol: "BRITANNIA.NS", name: "Britannia Industries" },
  { symbol: "TITAN.NS", name: "Titan Company" },
  { symbol: "ASIANPAINT.NS", name: "Asian Paints" },
  // Pharma / healthcare
  { symbol: "SUNPHARMA.NS", name: "Sun Pharmaceutical Industries" },
  { symbol: "DRREDDY.NS", name: "Dr. Reddy's Laboratories" },
  { symbol: "CIPLA.NS", name: "Cipla" },
  { symbol: "DIVISLAB.NS", name: "Divi's Laboratories" },
  { symbol: "APOLLOHOSP.NS", name: "Apollo Hospitals Enterprise" },
  // Metals / materials / infra
  { symbol: "TATASTEEL.NS", name: "Tata Steel" },
  { symbol: "JSWSTEEL.NS", name: "JSW Steel" },
  { symbol: "HINDALCO.NS", name: "Hindalco Industries" },
  { symbol: "ULTRACEMCO.NS", name: "UltraTech Cement" },
  { symbol: "GRASIM.NS", name: "Grasim Industries" },
  { symbol: "LT.NS", name: "Larsen & Toubro" },
  // Telecom / other
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel" },
  { symbol: "ADANIENT.NS", name: "Adani Enterprises" },
  { symbol: "ADANIPORTS.NS", name: "Adani Ports and Special Economic Zone" },
];

/**
 * Case-insensitive substring match on symbol or company name. `query` is
 * assumed already trimmed and non-empty.
 */
export function filterNseFallback(query: string, limit = 10): StockRef[] {
  const q = query.toLowerCase();
  const bare = q.replace(/\.ns$/, "");
  return NSE_FALLBACK_STOCKS.filter(
    (s) =>
      s.symbol.toLowerCase().includes(bare) ||
      s.name.toLowerCase().includes(q),
  ).slice(0, limit);
}
