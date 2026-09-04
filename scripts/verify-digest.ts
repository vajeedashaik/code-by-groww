/**
 * Standalone verification for lib/digest — no jest/vitest in this repo
 * (Phase 2-5 precedent). Run with `npm run verify:digest`.
 */
import { interpretExplanation } from "../lib/digest/interpret";
import { bucketDiffs, summaryLine, type WatchlistItemMeta, type BucketedDiffs } from "../lib/digest/summarize";
import type { Explanation } from "../lib/scoring/score";
import type { ScoredDiff } from "../lib/watchlist/scored-diff";

let failures = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`PASS: ${message}`);
  }
}

function explanation(overrides: Partial<Explanation>): Explanation {
  return {
    price_change_pct: 3,
    price_zscore: 1.5,
    volume_ratio: 1,
    market_change_pct: 0.2,
    sector_change_pct: 0.2,
    sector_used: "IT",
    data_completeness: "full",
    ...overrides,
  };
}

// --- interpretExplanation rules --------------------------------------------
assert(
  interpretExplanation(
    explanation({ volume_ratio: 4, market_change_pct: 0.1, sector_change_pct: 0.1, price_change_pct: 3 }),
  ) === "Moved independently of the market on unusually high volume.",
  "rule: high volume + independent move",
);

assert(
  interpretExplanation(
    explanation({ volume_ratio: 4, market_change_pct: 3, sector_change_pct: 3, price_change_pct: 3 }),
  ) === "Broad move on unusually high volume — the whole market/sector moved with it.",
  "rule: high volume + tracked benchmarks",
);

assert(
  interpretExplanation(
    explanation({ volume_ratio: 1, market_change_pct: 0.1, sector_change_pct: 0.1, price_change_pct: 3 }),
  ) === "Moved independently of its sector and the broader market.",
  "rule: normal volume + independent move",
);

assert(
  interpretExplanation(
    explanation({ volume_ratio: 1, market_change_pct: 3, sector_change_pct: 3, price_change_pct: 3 }),
  ) === "Mostly tracked the broader market.",
  "rule: normal volume + tracked benchmarks",
);

assert(
  interpretExplanation(explanation({ market_change_pct: null, sector_change_pct: null, sector_used: null })) ===
    "Moved on its own — not enough comparison data yet.",
  "rule: no comparison data at all",
);

// --- bucketDiffs -------------------------------------------------------------
function diff(overrides: Partial<ScoredDiff>): ScoredDiff {
  return {
    symbol: "TEST",
    isFirstView: false,
    currentSnapshotId: "snap-1",
    priceThen: 100,
    priceNow: 103,
    priceDelta: 3,
    priceDeltaPct: 3,
    volumeThen: 1000,
    volumeNow: 1000,
    timeElapsedMs: 3_600_000,
    seenAt: new Date().toISOString(),
    ...overrides,
  };
}

const items: WatchlistItemMeta[] = [
  { symbol: "A", companyName: "Alpha" },
  { symbol: "B", companyName: "Beta" },
  { symbol: "C", companyName: "Gamma" },
  { symbol: "D", companyName: "Delta" },
  { symbol: "E", companyName: "Epsilon" }, // no diff yet — must be omitted
];

const diffsMap = new Map<string, ScoredDiff>([
  ["A", diff({ symbol: "A", bucket: "Urgent", score: 2.5 })],
  ["B", diff({ symbol: "B", bucket: "Notable", score: 1.0 })],
  ["C", diff({ symbol: "C", bucket: "Routine", score: 0.2 })],
  [
    "D",
    diff({
      symbol: "D",
      isFirstView: true,
      priceThen: null,
      priceDelta: null,
      priceDeltaPct: null,
      timeElapsedMs: null,
      seenAt: null,
      currentSnapshotId: null,
    }),
  ],
]);

const bucketed = bucketDiffs(items, diffsMap);
assert(bucketed.urgent.length === 1 && bucketed.urgent[0].item.symbol === "A", "bucketDiffs: urgent bucket correct");
assert(bucketed.notable.length === 1 && bucketed.notable[0].item.symbol === "B", "bucketDiffs: notable bucket correct");
assert(bucketed.routine.length === 1 && bucketed.routine[0].item.symbol === "C", "bucketDiffs: routine bucket correct");
assert(
  bucketed.newlyAdded.length === 1 && bucketed.newlyAdded[0].item.symbol === "D",
  "bucketDiffs: newlyAdded bucket correct",
);
assert(
  !bucketed.urgent.some((b) => b.item.symbol === "E") &&
    !bucketed.notable.some((b) => b.item.symbol === "E") &&
    !bucketed.routine.some((b) => b.item.symbol === "E") &&
    !bucketed.newlyAdded.some((b) => b.item.symbol === "E"),
  "bucketDiffs: item with no diff yet is omitted from every bucket",
);

// --- summaryLine ---------------------------------------------------------
const normalSummary = summaryLine(bucketed, 5);
assert(normalSummary.kind === "normal", "summaryLine: mixed watchlist -> normal kind");
assert(
  normalSummary.text === "2 meaningful changes across 5 stocks.",
  `summaryLine: normal text (got "${normalSummary.text}")`,
);

const calmBucketed: BucketedDiffs = { urgent: [], notable: [], routine: bucketed.routine, newlyAdded: [] };
const calmSummary = summaryLine(calmBucketed, 5);
assert(calmSummary.kind === "calm", "summaryLine: no urgent/notable -> calm kind");
assert(
  calmSummary.text === "Nothing meaningful changed since you last checked.",
  `summaryLine: calm text (got "${calmSummary.text}")`,
);

const firstVisitBucketed: BucketedDiffs = { urgent: [], notable: [], routine: [], newlyAdded: bucketed.newlyAdded };
const firstVisitSummary = summaryLine(firstVisitBucketed, 1);
assert(firstVisitSummary.kind === "first-visit", "summaryLine: only newlyAdded -> first-visit kind");
assert(
  firstVisitSummary.text === "1 stock added — here's your first look.",
  `summaryLine: first-visit text (got "${firstVisitSummary.text}")`,
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll digest checks passed.");
}
