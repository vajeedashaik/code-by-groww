# Phase 6: "While You Were Away" Digest UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/dashboard`'s placeholder with a ranked "While you were away" digest (Urgent/Notable/Routine buckets, plain-language interpretations, a full "why flagged" evidence view) built entirely on top of Phase 4/5's existing diff+score data, without touching the race-verified mark-as-seen timing.

**Architecture:** Two new pure `lib/digest/` modules (bucketing/summary text, one-line interpretation rules) consumed by a small tree of client components under `components/digest/`, all reading from a newly-exported `useWatchlistDiffs()` hook on Phase 4's existing `WatchlistDiffsProvider`. `/dashboard`'s Server Component fetches watchlist metadata and wraps the tree in that same provider — no second fetch, no new API route.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS v4, no test runner (same Phase 2-5 precedent) — a standalone `tsx` verification script covers the pure `lib/digest/` functions, mirroring `scripts/verify-scoring.ts`.

**Reference:** Full design in `docs/superpowers/specs/2026-09-04-phase6-digest-ui-design.md`. Acceptance tests in `phase6.md`.

---

### Task 1: Extract `ScoredDiff` type + export `useWatchlistDiffs()` hook

**Files:**
- Create: `lib/watchlist/scored-diff.ts`
- Modify: `components/watchlist/diff-panel.tsx` (full replace)

- [ ] **Step 1: Create the shared type file**

```typescript
import type { SymbolDiff } from "@/lib/watchlist/diff";
import type { Bucket, Confidence, Explanation } from "@/lib/scoring/score";

/** SymbolDiff plus the Phase 5 fields the diffs API merges in for non-first-view symbols. */
export type ScoredDiff = SymbolDiff & {
  score?: number;
  bucket?: Bucket;
  confidence?: Confidence;
  explanation?: Explanation;
};
```

- [ ] **Step 2: Replace `components/watchlist/diff-panel.tsx` in full**

**CRITICAL: the `WatchlistDiffsProvider` function body below (the `useEffect`,
its `cancelled` flag, and the `await markWatchlistSeen()` placement) is
BYTE-FOR-BYTE IDENTICAL to the current file.** This is Phase 4's
previously code-reviewed, race-condition-safe sequencing (mark-as-seen
fires only after the diff is in React state). Do not reorder, refactor, or
"clean up" anything inside that function — only the type import at the top
changed (moved to `lib/watchlist/scored-diff.ts`) and one new exported
function (`useWatchlistDiffs`) was added after it.

```typescript
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { markWatchlistSeen } from "@/app/(protected)/watchlist/actions";
import { formatElapsed } from "@/lib/watchlist/format-elapsed";
import type { Bucket } from "@/lib/scoring/score";
import type { ScoredDiff } from "@/lib/watchlist/scored-diff";

interface DiffsState {
  diffs: Map<string, ScoredDiff> | null;
  loading: boolean;
}

const DiffsContext = createContext<DiffsState>({ diffs: null, loading: true });

/**
 * Fetches GET /api/watchlist/diffs exactly once for the whole page (not once
 * per row), then fires markWatchlistSeen() only after the diffs are in state
 * and have had a chance to render — marking seen before showing the diff
 * would erase the very change being displayed. If the fetch fails,
 * markWatchlistSeen is never called, so a failed view doesn't consume the
 * unseen state.
 */
export function WatchlistDiffsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<DiffsState>({ diffs: null, loading: true });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/watchlist/diffs");
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body: { diffs: ScoredDiff[] } = await res.json();
        if (cancelled) return;
        setState({
          diffs: new Map(body.diffs.map((d) => [d.symbol, d])),
          loading: false,
        });
        await markWatchlistSeen();
      } catch {
        if (!cancelled) setState({ diffs: null, loading: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DiffsContext.Provider value={state}>{children}</DiffsContext.Provider>
  );
}

/**
 * Read the shared diffs fetch (the diffs map + loading flag) from outside
 * DiffLine — used by the Phase 6 digest components so they don't trigger a
 * second fetch or re-derive the mark-as-seen timing.
 */
export function useWatchlistDiffs(): DiffsState {
  return useContext(DiffsContext);
}

const BUCKET_COLOR: Record<Bucket, string> = {
  Urgent: "text-red-600",
  Notable: "text-amber-600",
  Routine: "text-gray-500",
};

/** Renders one symbol's raw diff line plus its Phase 5 score/bucket, as plain text. */
export function DiffLine({ symbol }: { symbol: string }) {
  const { diffs, loading } = useContext(DiffsContext);

  if (loading) {
    return <span className="text-xs text-gray-400">Checking for changes…</span>;
  }
  if (!diffs) return null;

  const diff = diffs.get(symbol);
  if (!diff) return null;

  if (diff.isFirstView) {
    return <span className="text-xs text-gray-400">First time viewing</span>;
  }

  const pct = diff.priceDeltaPct;
  const pctColor =
    pct === null
      ? "text-gray-400"
      : pct > 0
        ? "text-green-600"
        : pct < 0
          ? "text-red-600"
          : "text-gray-500";
  const pctLabel =
    pct === null
      ? "no change"
      : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%`;
  const elapsed =
    diff.timeElapsedMs !== null ? formatElapsed(diff.timeElapsedMs) : "";

  return (
    <span className="text-xs">
      <span className={pctColor}>
        {pctLabel} since you last checked{elapsed ? `, ${elapsed}` : ""}
      </span>
      {diff.bucket && (
        <span className={`ml-2 ${BUCKET_COLOR[diff.bucket]}`}>
          [{diff.bucket}, score {diff.score?.toFixed(2)}, {diff.confidence} confidence]
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 3: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 4: Run `git diff` on `components/watchlist/diff-panel.tsx` and confirm the `useEffect` body inside `WatchlistDiffsProvider` has zero line changes** — only the imports at the top and the new `useWatchlistDiffs` function (inserted after `WatchlistDiffsProvider`, before `BUCKET_COLOR`) should differ.

- [ ] **Step 5: Commit**

```bash
git add lib/watchlist/scored-diff.ts components/watchlist/diff-panel.tsx
git commit -m "feat: export useWatchlistDiffs hook, extract ScoredDiff type"
```

---

### Task 2: One-line interpretation rule engine

**Files:**
- Create: `lib/digest/interpret.ts`

- [ ] **Step 1: Write the module**

```typescript
import type { Explanation } from "@/lib/scoring/score";

/**
 * Ordered rule list, first match wins. Deliberately simple and readable as
 * one function — phase6.md's own manual step 2 expects these to be
 * hand-tuned against real change_events data, so keep it easy to edit.
 * Thresholds are named constants, not magic numbers, for the same reason.
 */
const HIGH_VOLUME_RATIO = 2;
const INDEPENDENT_MOVE_THRESHOLD_PP = 1;

function relativeMoves(explanation: Explanation): number[] {
  const moves: number[] = [];
  if (explanation.market_change_pct !== null) {
    moves.push(Math.abs(explanation.price_change_pct - explanation.market_change_pct));
  }
  if (explanation.sector_change_pct !== null) {
    moves.push(Math.abs(explanation.price_change_pct - explanation.sector_change_pct));
  }
  return moves;
}

export function interpretExplanation(explanation: Explanation): string {
  const { volume_ratio, market_change_pct, sector_change_pct } = explanation;

  if (market_change_pct === null && sector_change_pct === null) {
    return "Moved on its own — not enough comparison data yet.";
  }

  const moves = relativeMoves(explanation);
  const movedIndependently = moves.some((m) => m >= INDEPENDENT_MOVE_THRESHOLD_PP);
  const highVolume = volume_ratio !== null && volume_ratio >= HIGH_VOLUME_RATIO;

  if (highVolume && movedIndependently) {
    return "Moved independently of the market on unusually high volume.";
  }
  if (highVolume) {
    return "Broad move on unusually high volume — the whole market/sector moved with it.";
  }
  if (movedIndependently) {
    return "Moved independently of its sector and the broader market.";
  }
  return "Mostly tracked the broader market.";
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add lib/digest/interpret.ts
git commit -m "feat: interpretExplanation — plain-language template rule engine"
```

---

### Task 3: Bucketing + summary line

**Files:**
- Create: `lib/digest/summarize.ts`

- [ ] **Step 1: Write the module**

```typescript
import type { ScoredDiff } from "@/lib/watchlist/scored-diff";

export interface WatchlistItemMeta {
  symbol: string;
  companyName: string | null;
}

export interface BucketedItem {
  item: WatchlistItemMeta;
  diff: ScoredDiff;
}

export interface BucketedDiffs {
  urgent: BucketedItem[];
  notable: BucketedItem[];
  routine: BucketedItem[];
  newlyAdded: BucketedItem[];
}

/**
 * Groups watchlist items by their current ScoredDiff. An item with no
 * matching diff yet (the fetch hasn't resolved for that symbol, or it's
 * missing from the response) is simply omitted from every bucket rather
 * than guessed at.
 */
export function bucketDiffs(
  items: WatchlistItemMeta[],
  diffs: Map<string, ScoredDiff>,
): BucketedDiffs {
  const result: BucketedDiffs = {
    urgent: [],
    notable: [],
    routine: [],
    newlyAdded: [],
  };

  for (const item of items) {
    const diff = diffs.get(item.symbol);
    if (!diff) continue;

    const entry: BucketedItem = { item, diff };
    if (diff.isFirstView) {
      result.newlyAdded.push(entry);
    } else if (diff.bucket === "Urgent") {
      result.urgent.push(entry);
    } else if (diff.bucket === "Notable") {
      result.notable.push(entry);
    } else if (diff.bucket === "Routine") {
      result.routine.push(entry);
    }
  }

  return result;
}

export type SummaryKind = "normal" | "calm" | "first-visit";

export interface Summary {
  kind: SummaryKind;
  text: string;
}

/**
 * The digest's headline. Three distinct cases (phase6.md task 4):
 * - "first-visit": every scored-or-newer item is first-view (nothing has
 *   been scored yet at all) — a brand new watchlist or a fresh user.
 * - "calm": at least one item has been scored, but nothing rose above
 *   Routine — the "attention rationing" product thesis made visible.
 * - "normal": there's at least one Urgent/Notable change to report.
 */
export function summaryLine(bucketed: BucketedDiffs, totalItems: number): Summary {
  const meaningfulCount = bucketed.urgent.length + bucketed.notable.length;
  const hasAnyScored =
    bucketed.urgent.length + bucketed.notable.length + bucketed.routine.length > 0;

  if (!hasAnyScored && bucketed.newlyAdded.length > 0) {
    const n = bucketed.newlyAdded.length;
    return {
      kind: "first-visit",
      text: `${n} stock${n === 1 ? "" : "s"} added — here's your first look.`,
    };
  }

  if (meaningfulCount === 0) {
    return {
      kind: "calm",
      text: "Nothing meaningful changed since you last checked.",
    };
  }

  return {
    kind: "normal",
    text: `${meaningfulCount} meaningful change${meaningfulCount === 1 ? "" : "s"} across ${totalItems} stock${totalItems === 1 ? "" : "s"}.`,
  };
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add lib/digest/summarize.ts
git commit -m "feat: bucketDiffs + summaryLine — digest grouping and headline text"
```

---

### Task 4: Verification script for `lib/digest`

**Files:**
- Create: `scripts/verify-digest.ts`
- Modify: `package.json` (add `verify:digest` script — `tsx` is already a devDependency from Phase 5)

- [ ] **Step 1: Add the npm script**

Edit `package.json`'s `"scripts"` block to add:

```json
    "verify:digest": "tsx scripts/verify-digest.ts"
```

- [ ] **Step 2: Write the verification script**

```typescript
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
```

- [ ] **Step 3: Run the script and confirm all checks pass**

Run: `npm run verify:digest`
Expected: every line prints `PASS: ...`, ending with `All digest checks passed.`, exit code 0. If any FAIL, the fix belongs in `lib/digest/interpret.ts` or `lib/digest/summarize.ts` (Tasks 2/3), not in the test — re-check the hand-traced logic against the rules in the design spec before changing test expectations.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-digest.ts package.json
git commit -m "test: standalone verification script for lib/digest"
```

---

### Task 5: "Why is this flagged?" detail

**Files:**
- Create: `components/digest/why-flagged-detail.tsx`

- [ ] **Step 1: Write the component**

```typescript
import type { Confidence, Explanation } from "@/lib/scoring/score";

/**
 * Full evidence trail for one flagged stock, labeled plainly — not raw
 * numbers dumped on screen (phase6.md task 3). This is the ONE place a
 * confidence label appears; the main digest stays free of it per spec.
 */
export default function WhyFlaggedDetail({
  explanation,
  confidence,
}: {
  explanation: Explanation;
  confidence: Confidence;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "Price move", value: `${explanation.price_change_pct.toFixed(2)}%` },
    {
      label: "Price z-score",
      value: `${explanation.price_zscore.toFixed(2)}σ — standard deviations from this stock's normal daily move`,
    },
    {
      label: "Market comparison",
      value:
        explanation.market_change_pct !== null
          ? `Stock ${explanation.price_change_pct.toFixed(2)}% vs Nifty 50 ${explanation.market_change_pct.toFixed(2)}%`
          : "No market comparison available",
    },
    {
      label: "Sector comparison",
      value:
        explanation.sector_used !== null && explanation.sector_change_pct !== null
          ? `Stock ${explanation.price_change_pct.toFixed(2)}% vs ${explanation.sector_used} sector ${explanation.sector_change_pct.toFixed(2)}%`
          : "No sector mapping for this stock",
    },
    {
      label: "Volume",
      value:
        explanation.volume_ratio !== null
          ? `${explanation.volume_ratio.toFixed(1)}x normal volume`
          : "No volume comparison available",
    },
    { label: "Confidence", value: confidence },
  ];

  return (
    <dl className="space-y-1.5 text-xs text-gray-600">
      {rows.map((row) => (
        <div key={row.label} className="flex gap-3">
          <dt className="w-32 shrink-0 font-medium text-gray-500">{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add components/digest/why-flagged-detail.tsx
git commit -m "feat: WhyFlaggedDetail — full labeled evidence trail per stock"
```

---

### Task 6: Stock card (Urgent/Notable)

**Files:**
- Create: `components/digest/stock-card.tsx`

- [ ] **Step 1: Write the component**

```typescript
import type { WatchlistItemMeta } from "@/lib/digest/summarize";
import type { ScoredDiff } from "@/lib/watchlist/scored-diff";
import { formatElapsed } from "@/lib/watchlist/format-elapsed";
import { interpretExplanation } from "@/lib/digest/interpret";
import WhyFlaggedDetail from "@/components/digest/why-flagged-detail";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/**
 * Full card for an Urgent/Notable stock: symbol/name, price + % since last
 * seen, time since last seen, a one-line interpretation, and an expandable
 * full evidence trail (phase6.md task 2/3).
 */
export default function StockCard({
  item,
  diff,
}: {
  item: WatchlistItemMeta;
  diff: ScoredDiff;
}) {
  const pct = diff.priceDeltaPct;
  const pctColor =
    pct === null
      ? "text-gray-400"
      : pct > 0
        ? "text-green-600"
        : pct < 0
          ? "text-red-600"
          : "text-gray-500";
  const pctLabel =
    pct === null ? "no change" : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%`;
  const elapsed = diff.timeElapsedMs !== null ? formatElapsed(diff.timeElapsedMs) : "";
  const interpretation = diff.explanation ? interpretExplanation(diff.explanation) : null;

  return (
    <div className="rounded border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-medium">{item.symbol}</span>
            {item.companyName && (
              <span className="truncate text-sm text-gray-500">{item.companyName}</span>
            )}
          </div>
          {interpretation && <p className="mt-1 text-sm text-gray-700">{interpretation}</p>}
          {elapsed && <p className="mt-1 text-xs text-gray-400">Last checked {elapsed}</p>}
        </div>
        <div className="shrink-0 text-right">
          {diff.priceNow !== null && (
            <div className="font-medium tabular-nums">{inr.format(diff.priceNow)}</div>
          )}
          <div className={`text-xs tabular-nums ${pctColor}`}>{pctLabel}</div>
        </div>
      </div>
      {diff.explanation && diff.confidence && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-gray-500">Why is this flagged?</summary>
          <div className="pt-2">
            <WhyFlaggedDetail explanation={diff.explanation} confidence={diff.confidence} />
          </div>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add components/digest/stock-card.tsx
git commit -m "feat: StockCard — full card for Urgent/Notable stocks"
```

---

### Task 7: Routine line

**Files:**
- Create: `components/digest/routine-line.tsx`

- [ ] **Step 1: Write the component**

```typescript
import type { WatchlistItemMeta } from "@/lib/digest/summarize";
import type { ScoredDiff } from "@/lib/watchlist/scored-diff";

/** Compact single line for a Routine stock — symbol + % change, nothing more (phase6.md task 2). */
export default function RoutineLine({
  item,
  diff,
}: {
  item: WatchlistItemMeta;
  diff: ScoredDiff;
}) {
  const pct = diff.priceDeltaPct;
  const pctColor =
    pct === null
      ? "text-gray-400"
      : pct > 0
        ? "text-green-600"
        : pct < 0
          ? "text-red-600"
          : "text-gray-500";
  const pctLabel =
    pct === null ? "no change" : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%`;

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-700">{item.symbol}</span>
      <span className={`tabular-nums ${pctColor}`}>{pctLabel}</span>
    </div>
  );
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add components/digest/routine-line.tsx
git commit -m "feat: RoutineLine — compact single-line row for Routine stocks"
```

---

### Task 8: Newly added section

**Files:**
- Create: `components/digest/newly-added-section.tsx`

- [ ] **Step 1: Write the component**

```typescript
import type { BucketedItem } from "@/lib/digest/summarize";

/** Lightweight list of first-view symbols — nothing to score yet (phase6.md task 1). */
export default function NewlyAddedSection({ items }: { items: BucketedItem[] }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        Newly added ({items.length})
      </h2>
      <ul className="space-y-1">
        {items.map(({ item }) => (
          <li key={item.symbol} className="flex items-baseline gap-2 text-sm">
            <span className="font-medium">{item.symbol}</span>
            {item.companyName && <span className="text-gray-500">{item.companyName}</span>}
            <span className="text-xs text-gray-400">First time viewing</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add components/digest/newly-added-section.tsx
git commit -m "feat: NewlyAddedSection — lightweight first-view stock list"
```

---

### Task 9: Bucket section (collapsible wrapper)

**Files:**
- Create: `components/digest/bucket-section.tsx`

- [ ] **Step 1: Write the component**

```typescript
"use client";

import type { BucketedItem } from "@/lib/digest/summarize";
import StockCard from "@/components/digest/stock-card";
import RoutineLine from "@/components/digest/routine-line";

const TONE_CLASSES: Record<"urgent" | "notable" | "routine", string> = {
  urgent: "text-red-700",
  notable: "text-amber-700",
  routine: "text-gray-500",
};

/**
 * One collapsible bucket section. Urgent/Notable render StockCard (full
 * detail); Routine renders RoutineLine (compact) — the "attention
 * rationing" thesis made visible via native <details>, no custom JS state
 * (phase6.md: "not cosmetic," no animations beyond basic functional ones).
 * Renders nothing when there are no items in this bucket.
 */
export default function BucketSection({
  title,
  tone,
  items,
  defaultOpen,
  variant,
}: {
  title: string;
  tone: "urgent" | "notable" | "routine";
  items: BucketedItem[];
  defaultOpen: boolean;
  variant: "card" | "compact";
}) {
  if (items.length === 0) return null;

  return (
    <details open={defaultOpen}>
      <summary className={`cursor-pointer text-sm font-semibold uppercase tracking-wide ${TONE_CLASSES[tone]}`}>
        {title} ({items.length})
      </summary>
      <div className={variant === "card" ? "space-y-3 pt-3" : "space-y-1 pt-2"}>
        {items.map(({ item, diff }) =>
          variant === "card" ? (
            <StockCard key={item.symbol} item={item} diff={diff} />
          ) : (
            <RoutineLine key={item.symbol} item={item} diff={diff} />
          ),
        )}
      </div>
    </details>
  );
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add components/digest/bucket-section.tsx
git commit -m "feat: BucketSection — collapsible Urgent/Notable/Routine wrapper"
```

---

### Task 10: Digest view (top-level assembly)

**Files:**
- Create: `components/digest/digest-view.tsx`

- [ ] **Step 1: Write the component**

```typescript
"use client";

import { useWatchlistDiffs } from "@/components/watchlist/diff-panel";
import { bucketDiffs, summaryLine, type WatchlistItemMeta } from "@/lib/digest/summarize";
import BucketSection from "@/components/digest/bucket-section";
import NewlyAddedSection from "@/components/digest/newly-added-section";

/**
 * Top-level digest assembly. Reads the ALREADY-fetched diffs from
 * useWatchlistDiffs() (Phase 4's provider, unchanged) — no second fetch,
 * no interference with the mark-as-seen timing (phase6.md task 6).
 */
export default function DigestView({ items }: { items: WatchlistItemMeta[] }) {
  const { diffs, loading } = useWatchlistDiffs();

  if (loading) {
    return <p className="text-sm text-gray-400">Checking for changes…</p>;
  }
  if (!diffs) {
    return (
      <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        Couldn&apos;t load your digest. Refresh to try again.
      </p>
    );
  }

  const bucketed = bucketDiffs(items, diffs);
  const summary = summaryLine(bucketed, items.length);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{summary.text}</h1>

      <div className="space-y-6">
        <BucketSection title="Urgent" tone="urgent" items={bucketed.urgent} defaultOpen variant="card" />
        <BucketSection title="Notable" tone="notable" items={bucketed.notable} defaultOpen variant="card" />
        <BucketSection title="Routine" tone="routine" items={bucketed.routine} defaultOpen={false} variant="compact" />
      </div>

      {bucketed.newlyAdded.length > 0 && <NewlyAddedSection items={bucketed.newlyAdded} />}
    </div>
  );
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add components/digest/digest-view.tsx
git commit -m "feat: DigestView — top-level digest assembly (summary + buckets)"
```

---

### Task 11: Rewrite `/dashboard` as the digest page

**Files:**
- Modify: `app/(protected)/dashboard/page.tsx` (full replace)

- [ ] **Step 1: Replace the file**

```typescript
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WatchlistDiffsProvider } from "@/components/watchlist/diff-panel";
import DigestView from "@/components/digest/digest-view";

export const dynamic = "force-dynamic";

/**
 * The digest — the first thing a returning user sees (phase6.md's "front
 * door"). Fetches watchlist metadata (symbol/name) server-side; live
 * scores/diffs come from the client-side WatchlistDiffsProvider fetch,
 * same as /watchlist already does.
 */
export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("watchlist_items")
    .select("symbol, company_name");

  if (error) {
    return (
      <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        Couldn&apos;t load your digest. Refresh to try again.
      </p>
    );
  }

  const items = (data ?? []).map((row) => ({
    symbol: row.symbol,
    companyName: row.company_name,
  }));

  if (items.length === 0) {
    return (
      <div className="rounded border border-dashed border-gray-300 p-8 text-center">
        <p className="text-sm font-medium text-gray-700">Nothing on your watchlist yet</p>
        <p className="mt-1 text-sm text-gray-500">
          <Link href="/watchlist" className="underline">
            Add your first stock
          </Link>{" "}
          to start seeing your digest here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WatchlistDiffsProvider>
        <DigestView items={items} />
      </WatchlistDiffsProvider>
      <p className="text-sm">
        <Link href="/watchlist" className="text-gray-600 underline hover:text-gray-900">
          View full watchlist
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Run `npx next build`**

Expected: compiles successfully, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(protected)/dashboard/page.tsx"
git commit -m "feat: rewrite /dashboard as the digest page"
```

---

### Task 12: Add "Back to digest" link on `/watchlist`

**Files:**
- Modify: `app/(protected)/watchlist/page.tsx`

- [ ] **Step 1: Add a `Link` import and a small link near the page heading**

Add this import near the top of the file, alongside the other imports:

```typescript
import Link from "next/link";
```

Then find this block (the page heading, near the top of the returned JSX):

```typescript
      <div>
        <h1 className="text-2xl font-semibold">Your watchlist</h1>
        <p className="text-sm text-gray-600">
          Search a stock, add it with an optional thesis, and it stays here —
          synced to your account.
        </p>
      </div>
```

Replace it with:

```typescript
      <div>
        <h1 className="text-2xl font-semibold">Your watchlist</h1>
        <p className="text-sm text-gray-600">
          Search a stock, add it with an optional thesis, and it stays here —
          synced to your account.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/dashboard" className="text-gray-600 underline hover:text-gray-900">
            Back to digest
          </Link>
        </p>
      </div>
```

Do not change anything else in this file — the `AddStock`, item list,
`WatchlistDiffsProvider`/`DiffLine` usage, and all server-side queries stay
exactly as they are.

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Run `npx next build`**

Expected: compiles successfully, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(protected)/watchlist/page.tsx"
git commit -m "feat: add back-to-digest link on /watchlist"
```

---

### Task 13: Final verification pass

**Files:** none (verification + doc update only)

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: compiled successfully, 0 errors. Confirm `/dashboard` is still listed as a route (dynamic, since it now does a server-side Supabase fetch with `force-dynamic`).

- [ ] **Step 3: Digest verification script**

Run: `npm run verify:digest`
Expected: all `PASS:` lines, `All digest checks passed.`, exit 0.

- [ ] **Step 4: Re-run the Phase 5 scoring script too (regression check)**

Run: `npm run verify:scoring`
Expected: unchanged, all 13 checks still pass — confirms nothing in this phase touched `lib/scoring/`.

- [ ] **Step 5: Update `context.md`**

Add a "Current state — Phase 6" section (mirroring the Phase 3/4/5 section
style) documenting: what's built (route change, new `lib/digest/` and
`components/digest/` files, the reused-unchanged provider), the fact that
`/dashboard`'s Phase 1 placeholder content is gone, verification results
(`typecheck`/`build`/`verify:digest`/`verify:scoring` all clean), and that
ALL 8 of phase6.md's TESTING items are the user's job (they require a
browser, real Clerk session, real multi-symbol data, a mobile-width resize,
and a "cold read" from a person unfamiliar with the project — none of which
can be done headlessly). Also record phase6.md's 4 MANUAL STEPS as
outstanding (judging the digest's calm-vs-noisy feel, hand-tuning the
`interpretExplanation` templates against real data, finalizing empty-state
copy, taking screenshots).

- [ ] **Step 6: Commit the context update**

```bash
git add context.md
git commit -m "docs: Phase 6 context update — digest UI built, all browser tests outstanding"
```

---

## What this plan does NOT cover (explicitly out of scope, per phase6.md)

- Thesis display or thesis-relevance verdicts (Phase 7) — thesis text
  exists in the DB since Phase 2 but isn't rendered anywhere in this phase.
- Staleness/confidence badges in the main digest (Phase 8) — confidence
  appears only inside `WhyFlaggedDetail`.
- Animations/transitions beyond the browser's native `<details>` toggle.
- Any change to `lib/scoring/`, `lib/watchlist/diff.ts`'s core logic, or
  `markWatchlistSeen`'s timing — all reused exactly as Phase 4/5 left them.
- Weight/threshold tuning, sector mapping review, or copy finalization —
  phase6.md's own manual steps, the user's job after this plan lands.
