/**
 * Standalone verification for lib/market-data/currency.ts — same tsx-based
 * pattern as verify-scoring/verify-digest/verify-thesis/verify-reconcile/
 * verify-alerts (no jest/vitest in this repo). Run with `npm run
 * verify:currency`.
 */
import { isIndianSymbol, formatPrice } from "../lib/market-data/currency";

let failures = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`PASS: ${message}`);
  }
}

// --- isIndianSymbol ---------------------------------------------------------
assert(isIndianSymbol("RELIANCE.NS") === true, "isIndianSymbol: .NS suffix is Indian");
assert(isIndianSymbol("TATASTEEL.BO") === true, "isIndianSymbol: .BO suffix is Indian");
assert(isIndianSymbol("reliance.ns") === true, "isIndianSymbol: suffix match is case-insensitive");
assert(isIndianSymbol("AAPL") === false, "isIndianSymbol: bare US ticker is not Indian");
assert(isIndianSymbol("BOAAPL") === false, "isIndianSymbol: 'BO' must be a suffix, not a substring anywhere");

// --- formatPrice -------------------------------------------------------------
assert(
  formatPrice("RELIANCE.NS", 1250.4) === "₹1,250.40",
  `formatPrice: NSE symbol formats as INR (got "${formatPrice("RELIANCE.NS", 1250.4)}")`,
);
assert(
  formatPrice("AAPL", 193.42) === "$193.42",
  `formatPrice: bare US symbol formats as USD, not INR (got "${formatPrice("AAPL", 193.42)}")`,
);
assert(
  formatPrice("TATASTEEL.BO", 120) === "₹120.00",
  `formatPrice: .BO symbol formats as INR (got "${formatPrice("TATASTEEL.BO", 120)}")`,
);
assert(
  !formatPrice("AAPL", 193.42).includes("₹"),
  "formatPrice: US symbol's formatted string never contains the INR sign",
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll currency-formatting checks passed.");
}
