/**
 * Standalone verification for lib/market-data/reconcile.ts (phase8.md task 2)
 * — same tsx-based pattern as verify-scoring/verify-digest/verify-thesis (no
 * jest/vitest in this repo). Run with `npm run verify:reconcile`.
 */
import { reconcileQuotes, CONFLICT_THRESHOLD_PCT, RECONCILE_TOLERANCE_MS } from "../lib/market-data/reconcile";
import type { Quote } from "../lib/market-data/types";

let failures = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`PASS: ${message}`);
  }
}

function quote(source: string, price: number, fetchedAt: Date): Quote {
  return { symbol: "AAPL", price, volume: 1000, source, fetchedAt };
}

const now = new Date("2026-01-01T10:00:00.000Z");

// --- Single source: no reconciliation needed -------------------------------
const single = reconcileQuotes([quote("yahoo", 100, now)]);
assert(single.conflict === false, "single source is never a conflict");
assert(single.alternate === null, "single source has no alternate");
assert(single.chosen.source === "yahoo", "single source is chosen as-is");

// --- Agreement within threshold, same instant -------------------------------
const agree = reconcileQuotes([quote("yahoo", 100, now), quote("finnhub", 100.05, now)]);
assert(agree.conflict === false, "prices within threshold -> no conflict");
assert(agree.chosen.source === "yahoo", "agreement still picks yahoo by source priority");
assert(agree.alternate?.source === "finnhub", "the non-chosen quote is recorded as the alternate");

// --- Genuine conflict: same instant, price disagreement over threshold -----
const conflictPct = CONFLICT_THRESHOLD_PCT + 0.5;
const disagreePrice = 100 * (1 + conflictPct / 100);
const conflict = reconcileQuotes([quote("yahoo", 100, now), quote("finnhub", disagreePrice, now)]);
assert(conflict.conflict === true, "prices beyond threshold at the same instant -> conflict");
assert(conflict.chosen.source === "yahoo", "conflict tie-break picks yahoo (source priority)");
assert(conflict.alternate?.source === "finnhub", "conflict keeps finnhub's value as the alternate");
assert(conflict.alternate?.price === disagreePrice, "the alternate's price is preserved exactly, not averaged");

// --- Order independence: finnhub-first input still resolves the same way ---
const reordered = reconcileQuotes([quote("finnhub", disagreePrice, now), quote("yahoo", 100, now)]);
assert(reordered.chosen.source === "yahoo", "reconciliation is order-independent (yahoo still wins on priority)");
assert(reordered.conflict === true, "reordered input still detects the same conflict");

// --- Outside the tolerance window: recency wins, not flagged as a conflict --
const later = new Date(now.getTime() + RECONCILE_TOLERANCE_MS + 5000);
const recency = reconcileQuotes([quote("yahoo", 100, now), quote("finnhub", 200, later)]);
assert(recency.conflict === false, "quotes far apart in time are not a 'conflict' -- just stale vs fresh");
assert(recency.chosen.source === "finnhub", "the more recent quote is preferred outside the tolerance window");
assert(recency.alternate?.source === "yahoo", "the older quote is kept as the alternate, not discarded");

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll reconciliation checks passed.");
}
