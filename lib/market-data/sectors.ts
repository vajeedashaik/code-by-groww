/**
 * Static sector reference data. There is no reliable free sector-index API
 * for NSE, so this hand-picked map of liquid large-caps per sector is a
 * deliberate trade-off, not an oversight — see
 * docs/superpowers/specs/2026-09-04-phase5-meaningfulness-engine-design.md.
 * Edit this list (per phase5.md's manual step 1) to match your demo
 * watchlist's actual sectors.
 */
export const SECTOR_MAP: Record<string, string> = {
  // IT
  "TCS.NS": "IT",
  "INFY.NS": "IT",
  "WIPRO.NS": "IT",
  "HCLTECH.NS": "IT",
  "TECHM.NS": "IT",
  // Banking
  "HDFCBANK.NS": "Banking",
  "ICICIBANK.NS": "Banking",
  "SBIN.NS": "Banking",
  "KOTAKBANK.NS": "Banking",
  "AXISBANK.NS": "Banking",
  // Auto
  "MARUTI.NS": "Auto",
  "TATAMOTORS.NS": "Auto",
  "M&M.NS": "Auto",
  "BAJAJ-AUTO.NS": "Auto",
  "EICHERMOT.NS": "Auto",
  // Pharma
  "SUNPHARMA.NS": "Pharma",
  "DRREDDY.NS": "Pharma",
  "CIPLA.NS": "Pharma",
  "DIVISLAB.NS": "Pharma",
  "AUROPHARMA.NS": "Pharma",
  // FMCG
  "HINDUNILVR.NS": "FMCG",
  "ITC.NS": "FMCG",
  "NESTLEIND.NS": "FMCG",
  "BRITANNIA.NS": "FMCG",
  "DABUR.NS": "FMCG",
  // Energy
  "RELIANCE.NS": "Energy",
  "ONGC.NS": "Energy",
  "NTPC.NS": "Energy",
  "POWERGRID.NS": "Energy",
  "COALINDIA.NS": "Energy",
};

/** Nifty 50 — the market benchmark. Just another symbol in the pipeline. */
export const MARKET_BENCHMARK_SYMBOL = "^NSEI";

/** Every symbol the sector map references, deduped. */
export const SECTOR_REFERENCE_SYMBOLS = [...new Set(Object.keys(SECTOR_MAP))];

/** Market benchmark + every sector reference symbol — what the Inngest jobs must also fetch. */
export const ALL_REFERENCE_SYMBOLS = [
  MARKET_BENCHMARK_SYMBOL,
  ...SECTOR_REFERENCE_SYMBOLS,
];

/** Sector for a symbol, or null if unmapped (triggers the market-only scoring fallback). */
export function lookupSector(symbol: string): string | null {
  return SECTOR_MAP[symbol] ?? null;
}

/** Every reference symbol belonging to one sector — used to compute the sector benchmark average. */
export function symbolsInSector(sector: string): string[] {
  return SECTOR_REFERENCE_SYMBOLS.filter((s) => SECTOR_MAP[s] === sector);
}
