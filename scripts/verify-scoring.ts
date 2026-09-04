/**
 * Standalone verification for lib/scoring — no jest/vitest in this repo
 * (Phase 2-4 precedent), so this script exercises phase5.md's acceptance
 * tests 1-4 directly against the pure scoring functions. Run with
 * `npm run verify:scoring`.
 */
import {
  computeMeaningfulness,
  type MeaningfulnessInput,
} from "../lib/scoring/score";
import { computeVolatilityPct, computeAverageVolume } from "../lib/scoring/volatility";
import { computeDailyMovePct, computeSectorBenchmarkPct } from "../lib/scoring/benchmarks";

let failures = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`PASS: ${message}`);
  }
}

// --- Test 1: relative ranking (phase5.md acceptance test 1) ---------------
// Scenario (a): choppy stock (high own-volatility) riding a broad rally.
// +7% stock, +6% sector, +5% market, normal volume, ~5% daily volatility.
const scenarioA: MeaningfulnessInput = {
  priceDeltaPct: 7,
  volumeNow: 1_000_000,
  volumeAvgRecent: 1_000_000, // normal volume -> ratio 1 -> 0 contribution
  dailyVolPct: 5, // "choppy" — swings ~5%/day normally
  marketDeltaPct: 5,
  sectorDeltaPct: 6,
  sectorName: "Auto",
};

// Scenario (b): calm stock, flat market/sector, 4x volume surge.
// +3% stock, +0.2% sector, +0.1% market, 4x volume, ~1% daily volatility.
const scenarioB: MeaningfulnessInput = {
  priceDeltaPct: 3,
  volumeNow: 4_000_000,
  volumeAvgRecent: 1_000_000, // 4x normal
  dailyVolPct: 1, // "calm" — swings ~1%/day normally
  marketDeltaPct: 0.1,
  sectorDeltaPct: 0.2,
  sectorName: "FMCG",
};

const resultA = computeMeaningfulness(scenarioA);
const resultB = computeMeaningfulness(scenarioB);

console.log("Scenario A (choppy stock, broad rally):", resultA);
console.log("Scenario B (calm stock, volume surge):", resultB);

assert(resultB.score > resultA.score, "scenario (b) outranks scenario (a)");
assert(resultA.bucket === "Routine", "scenario (a) buckets as Routine");
assert(resultB.bucket === "Urgent", "scenario (b) buckets as Urgent");

// --- Test 2: insufficient daily_history -> graceful fallback --------------
const closesOnly10Days = Array.from({ length: 10 }, (_, i) => 100 + i);
const volShort = computeVolatilityPct(closesOnly10Days);
assert(volShort === null, "computeVolatilityPct returns null for <20 closes");

const resultLowConfidence = computeMeaningfulness({
  priceDeltaPct: 4,
  volumeNow: 500_000,
  volumeAvgRecent: 500_000,
  dailyVolPct: volShort, // null
  marketDeltaPct: 1,
  sectorDeltaPct: 1,
  sectorName: "IT",
});
assert(
  resultLowConfidence.confidence === "Low",
  "missing volatility -> Low confidence, no crash",
);
assert(
  Number.isFinite(resultLowConfidence.score),
  "score is finite when volatility is unavailable (no divide-by-zero)",
);

// --- Test 3: symbol not in sector mapping ----------------------------------
const resultNoSector = computeMeaningfulness({
  priceDeltaPct: 4,
  volumeNow: 500_000,
  volumeAvgRecent: 500_000,
  dailyVolPct: 2,
  marketDeltaPct: 1,
  sectorDeltaPct: null, // unmapped
  sectorName: null,
});
assert(
  resultNoSector.confidence === "Medium",
  "unmapped sector with volatility available -> Medium confidence",
);
assert(
  resultNoSector.explanation.sector_used === null,
  "unmapped sector -> sector_used is null in explanation",
);

// --- Test 4: zero/missing volume -------------------------------------------
const resultZeroVolume = computeMeaningfulness({
  priceDeltaPct: 4,
  volumeNow: 0,
  volumeAvgRecent: 0,
  dailyVolPct: 2,
  marketDeltaPct: 1,
  sectorDeltaPct: 1,
  sectorName: "Energy",
});
assert(
  Number.isFinite(resultZeroVolume.score),
  "zero volume -> finite score (no divide-by-zero)",
);
assert(
  resultZeroVolume.explanation.volume_ratio === null,
  "zero volume -> volume_ratio is null, not NaN/Infinity",
);

// --- Sanity checks on the smaller pure helpers ------------------------------
assert(
  computeAverageVolume([null, 0, 100, 200]) === 150,
  "computeAverageVolume ignores null/zero entries",
);
assert(
  computeDailyMovePct([100]) === null,
  "computeDailyMovePct needs at least 2 closes",
);
assert(
  computeSectorBenchmarkPct([[100, 102], [50, 49]]) !== null,
  "computeSectorBenchmarkPct averages member moves",
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll scoring checks passed.");
}
