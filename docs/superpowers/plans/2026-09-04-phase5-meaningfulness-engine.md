# Phase 5: Meaningfulness Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Phase 4's raw price/volume diff into a volatility-normalized, market/sector-relative meaningfulness score with a structured, stable-shaped explanation, persisted to `change_events` and exposed through the existing `GET /api/watchlist/diffs` response.

**Architecture:** A new `lib/scoring/` module of pure functions (volatility, benchmark %-move, weighted score+bucket+confidence) with zero DB/API calls inside them, fed by a thin orchestration function that batches the needed `daily_history` reads (reference symbols + watchlisted symbols in one bounded query, grouped in JS — same accepted pattern as the existing `.limit(symbols.length * 10)` calls in this codebase) and upserts `change_events` keyed on `(user_id, symbol, snapshot_id)`. Reference symbols (`^NSEI` + sector-mapped stocks) ride the existing Phase 3 Inngest jobs by being unioned into `loadWatchlistSymbols()`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (Postgres + RLS), no test runner installed — `tsx` is added as a dev dependency solely to run a standalone verification script (matches phase5.md's explicit unit-test acceptance criteria without pulling in jest/vitest).

**Reference:** Full design in `docs/superpowers/specs/2026-09-04-phase5-meaningfulness-engine-design.md`. Acceptance tests in `phase5.md`.

---

### Task 1: Migration 0004 + database types

**Files:**
- Create: `supabase/migrations/0004_change_events_snapshot_dedup.sql`
- Modify: `types/database.ts:126-161` (`change_events` table)
- Modify: `supabase/schema.sql:50-60` (keep the reference dump in sync)

- [ ] **Step 1: Write the migration**

```sql
-- Phase 5 — dedupe change_events by snapshot, not by insert-every-reload.
-- Run this in the Supabase SQL editor AFTER 0003_watchlist_company_name.sql.

alter table public.change_events
  add column snapshot_id uuid references public.market_snapshots (id);

alter table public.change_events
  add constraint change_events_user_symbol_snapshot_key
  unique (user_id, symbol, snapshot_id);
```

- [ ] **Step 2: Update `types/database.ts`'s `change_events` table**

Replace the whole `change_events` block (lines 126-161) with:

```typescript
      change_events: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          detected_at: string;
          snapshot_id: string | null;
          meaningfulness_score: number | null;
          magnitude: number | null;
          confidence: string | null;
          explanation: Json | null;
          thesis_verdict: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string; // defaults to auth.jwt()->>'sub'
          symbol: string;
          detected_at?: string;
          snapshot_id?: string | null;
          meaningfulness_score?: number | null;
          magnitude?: number | null;
          confidence?: string | null;
          explanation?: Json | null;
          thesis_verdict?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          symbol?: string;
          detected_at?: string;
          snapshot_id?: string | null;
          meaningfulness_score?: number | null;
          magnitude?: number | null;
          confidence?: string | null;
          explanation?: Json | null;
          thesis_verdict?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "change_events_snapshot_id_fkey";
            columns: ["snapshot_id"];
            referencedRelation: "market_snapshots";
            referencedColumns: ["id"];
          },
        ];
      };
```

- [ ] **Step 3: Update `supabase/schema.sql`'s `change_events` table + header comment**

Change the header comment on line 2 from
`-- Smart Market Watchlist — full schema (Phase 1 + Phase 2)` to
`-- Smart Market Watchlist — full schema (Phase 1 + Phase 2 + Phase 5)`.

Replace the `change_events` table block (lines 50-60) with:

```sql
create table if not exists public.change_events (
  id                   uuid primary key default gen_random_uuid(),
  user_id              text not null default (auth.jwt() ->> 'sub'),
  symbol               text not null,
  detected_at          timestamptz not null default now(),
  snapshot_id          uuid references public.market_snapshots (id),  -- Phase 5: dedup key
  meaningfulness_score numeric,
  magnitude            numeric,
  confidence           text,
  explanation          jsonb,
  thesis_verdict       text,
  unique (user_id, symbol, snapshot_id)
);
```

- [ ] **Step 4: Run `npx tsc --noEmit`**

Expected: exit 0, no output (schema.sql/migration are SQL, not type-checked, but this confirms the `types/database.ts` edit didn't break anything).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_change_events_snapshot_dedup.sql types/database.ts supabase/schema.sql
git commit -m "feat: change_events snapshot-dedup migration + types"
```

---

### Task 2: Sector reference data

**Files:**
- Create: `lib/market-data/sectors.ts`

- [ ] **Step 1: Write the sector map + reference symbol exports**

```typescript
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
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add lib/market-data/sectors.ts
git commit -m "feat: static NSE sector reference map + Nifty benchmark symbol"
```

---

### Task 3: Wire reference symbols into the Inngest jobs

**Files:**
- Modify: `lib/inngest/functions/shared.ts:1-28`

- [ ] **Step 1: Union `loadWatchlistSymbols()` with the reference set**

Replace the full file with:

```typescript
import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ALL_REFERENCE_SYMBOLS } from "@/lib/market-data/sectors";

/**
 * Helpers shared by both Inngest jobs. Symbol loading uses the SERVICE-ROLE
 * client on purpose: the watchlisted symbol set is shared reference data the
 * jobs need across all users, not something scoped to one Clerk session, and
 * the jobs run with no user context at all.
 */

/**
 * Distinct, trimmed, upper-cased symbols across every user's watchlist,
 * unioned with the fixed Phase 5 reference-symbol set (Nifty + every
 * sector-mapping stock) so both jobs fetch/store them even though no user
 * has them in watchlist_items — "just another symbol" per phase5.md task 2.
 */
export async function loadWatchlistSymbols(): Promise<string[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("watchlist_items")
    .select("symbol");

  if (error) {
    throw new Error(`loadWatchlistSymbols: ${error.message}`);
  }

  const set = new Set<string>();
  for (const row of data ?? []) {
    const s = (row.symbol ?? "").trim().toUpperCase();
    if (s) set.add(s);
  }
  for (const s of ALL_REFERENCE_SYMBOLS) {
    set.add(s);
  }
  return [...set];
}

/** Split `items` into arrays of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add lib/inngest/functions/shared.ts
git commit -m "feat: union reference symbols into loadWatchlistSymbols"
```

---

### Task 4: Volatility + benchmark pure functions

**Files:**
- Create: `lib/scoring/volatility.ts`
- Create: `lib/scoring/benchmarks.ts`

- [ ] **Step 1: Write `lib/scoring/volatility.ts`**

```typescript
/**
 * Pure volatility math — no DB/API calls. Callers pass in closes already
 * loaded from daily_history, oldest-to-newest.
 */

const VOLATILITY_WINDOW = 20;

/**
 * Std dev of daily % returns over the last 20 closes. Returns null when
 * fewer than 20 closes are available — the caller must fall back to raw %
 * change and flag reduced confidence (phase5.md task 3), never divide by a
 * null/zero volatility.
 */
export function computeVolatilityPct(closesOldestToNewest: number[]): number | null {
  if (closesOldestToNewest.length < VOLATILITY_WINDOW) return null;

  const window = closesOldestToNewest.slice(-VOLATILITY_WINDOW);
  const returns: number[] = [];
  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1];
    if (prev === 0) continue;
    returns.push(((window[i] - prev) / prev) * 100);
  }
  if (returns.length === 0) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

/** Average volume over the last 20 daily_history rows. Null if no usable data. */
export function computeAverageVolume(
  volumesOldestToNewest: (number | null)[],
): number | null {
  const window = volumesOldestToNewest
    .slice(-VOLATILITY_WINDOW)
    .filter((v): v is number => v !== null && v > 0);
  if (window.length === 0) return null;
  return window.reduce((a, b) => a + b, 0) / window.length;
}
```

- [ ] **Step 2: Write `lib/scoring/benchmarks.ts`**

```typescript
/**
 * Pure benchmark math — no DB/API calls. Market/sector benchmarks use
 * daily_history's latest-vs-prior-close ("today's session move"), a
 * documented mismatch against the stock's own arbitrary-length
 * last-seen-to-now diff window — see the Phase 5 design doc. Chosen to
 * avoid over-engineering snapshot-matching for reference symbols.
 */

/** % move from the second-to-last close to the last close. Null if fewer than 2 closes. */
export function computeDailyMovePct(closesOldestToNewest: number[]): number | null {
  if (closesOldestToNewest.length < 2) return null;
  const prior = closesOldestToNewest[closesOldestToNewest.length - 2];
  const latest = closesOldestToNewest[closesOldestToNewest.length - 1];
  if (prior === 0) return null;
  return ((latest - prior) / prior) * 100;
}

/** Average of each sector member's daily move. Null if no member has usable data. */
export function computeSectorBenchmarkPct(
  memberClosesOldestToNewest: number[][],
): number | null {
  const moves = memberClosesOldestToNewest
    .map(computeDailyMovePct)
    .filter((m): m is number => m !== null);
  if (moves.length === 0) return null;
  return moves.reduce((a, b) => a + b, 0) / moves.length;
}
```

- [ ] **Step 3: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 4: Commit**

```bash
git add lib/scoring/volatility.ts lib/scoring/benchmarks.ts
git commit -m "feat: pure volatility + benchmark math for scoring"
```

---

### Task 5: The scoring function

**Files:**
- Create: `lib/scoring/score.ts`

- [ ] **Step 1: Write the scoring module**

```typescript
/**
 * Pure meaningfulness scoring — no DB/API calls inside, unit-testable in
 * isolation (phase5.md task 4). All three z-scores share the same
 * denominator (the stock's own daily volatility), which is what makes them
 * directly comparable/combinable in one weighted sum without arbitrary
 * rescaling — see the Phase 5 design doc.
 */

export type Bucket = "Urgent" | "Notable" | "Routine";
export type Confidence = "Low" | "Medium" | "High";

export type DataCompleteness =
  | "full"
  | "no_sector"
  | "no_volatility"
  | "no_volatility_no_sector";

export interface Explanation {
  price_change_pct: number;
  price_zscore: number;
  volume_ratio: number | null;
  market_change_pct: number | null;
  sector_change_pct: number | null;
  sector_used: string | null;
  data_completeness: DataCompleteness;
}

export interface MeaningfulnessInput {
  priceDeltaPct: number;
  volumeNow: number | null;
  volumeAvgRecent: number | null;
  /** Null when fewer than 20 days of daily_history exist for this symbol. */
  dailyVolPct: number | null;
  /** Null only if the market benchmark itself has no usable data. */
  marketDeltaPct: number | null;
  /** Null when the symbol has no sector mapping, or the sector has no usable data. */
  sectorDeltaPct: number | null;
  sectorName: string | null;
}

export interface MeaningfulnessResult {
  score: number;
  bucket: Bucket;
  confidence: Confidence;
  explanation: Explanation;
}

/** Named, tunable weights — phase5.md task 6/manual step 2 is adjusting these. */
export const SCORE_WEIGHTS = {
  priceAnomaly: 0.4,
  volumeAnomaly: 0.2,
  marketRelative: 0.2,
  sectorRelative: 0.2,
} as const;

/** Named, tunable bucket thresholds — phase5.md manual step 3. Raw scale, not rescaled to 0-100. */
export const BUCKET_THRESHOLDS = {
  urgent: 2.0,
  notable: 0.8,
} as const;

export function computeMeaningfulness(
  input: MeaningfulnessInput,
): MeaningfulnessResult {
  const {
    priceDeltaPct,
    volumeNow,
    volumeAvgRecent,
    dailyVolPct,
    marketDeltaPct,
    sectorDeltaPct,
    sectorName,
  } = input;

  const volatilityAvailable = dailyVolPct !== null && dailyVolPct > 0;

  // Fallback (task 3): no volatility -> use raw % change directly, never divide by zero.
  const priceZScore = volatilityAvailable
    ? priceDeltaPct / dailyVolPct
    : priceDeltaPct;

  const marketRelativeZScore =
    marketDeltaPct === null
      ? 0
      : volatilityAvailable
        ? (priceDeltaPct - marketDeltaPct) / dailyVolPct
        : priceDeltaPct - marketDeltaPct;

  const hasSector = sectorDeltaPct !== null;
  const sectorRelativeZScore = !hasSector
    ? 0
    : volatilityAvailable
      ? (priceDeltaPct - sectorDeltaPct) / dailyVolPct
      : priceDeltaPct - sectorDeltaPct;

  const volumeRatio =
    volumeNow !== null && volumeAvgRecent !== null && volumeAvgRecent > 0
      ? volumeNow / volumeAvgRecent
      : null;
  // Only rewards volume SURGES — never penalizes below-average volume.
  const volumeComponent = volumeRatio !== null ? Math.max(0, volumeRatio - 1) : 0;

  const score =
    SCORE_WEIGHTS.priceAnomaly * priceZScore +
    SCORE_WEIGHTS.volumeAnomaly * volumeComponent +
    SCORE_WEIGHTS.marketRelative * marketRelativeZScore +
    SCORE_WEIGHTS.sectorRelative * sectorRelativeZScore;

  const bucket: Bucket =
    score >= BUCKET_THRESHOLDS.urgent
      ? "Urgent"
      : score >= BUCKET_THRESHOLDS.notable
        ? "Notable"
        : "Routine";

  const hasVolume = volumeRatio !== null;
  const confidence: Confidence = !volatilityAvailable
    ? "Low"
    : hasSector && hasVolume
      ? "High"
      : "Medium";

  const dataCompleteness: DataCompleteness = !volatilityAvailable
    ? hasSector
      ? "no_volatility"
      : "no_volatility_no_sector"
    : hasSector
      ? "full"
      : "no_sector";

  return {
    score,
    bucket,
    confidence,
    explanation: {
      price_change_pct: priceDeltaPct,
      price_zscore: priceZScore,
      volume_ratio: volumeRatio,
      market_change_pct: marketDeltaPct,
      sector_change_pct: sectorDeltaPct,
      sector_used: hasSector ? sectorName : null,
      data_completeness: dataCompleteness,
    },
  };
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add lib/scoring/score.ts
git commit -m "feat: computeMeaningfulness — weighted z-score scoring engine"
```

---

### Task 6: Verification script (phase5.md acceptance tests 1-4)

**Files:**
- Create: `scripts/verify-scoring.ts`
- Modify: `package.json` (add `tsx` devDependency + `verify:scoring` script)

- [ ] **Step 1: Add `tsx` as a dev dependency**

```bash
npm install -D tsx
```

Expected: `package.json`'s `devDependencies` gains `"tsx": "^..."`.

- [ ] **Step 2: Add the npm script**

Edit `package.json`'s `"scripts"` block to add:

```json
    "verify:scoring": "tsx scripts/verify-scoring.ts"
```

- [ ] **Step 3: Write the verification script**

```typescript
/**
 * Standalone verification for lib/scoring — no jest/vitest in this repo
 * (Phase 2-4 precedent), so this script exercises phase5.md's acceptance
 * tests 1-4 directly against the pure scoring functions. Run with
 * `npm run verify:scoring`.
 */
import {
  computeMeaningfulness,
  type MeaningfulnessInput,
} from "@/lib/scoring/score";
import { computeVolatilityPct, computeAverageVolume } from "@/lib/scoring/volatility";
import { computeDailyMovePct, computeSectorBenchmarkPct } from "@/lib/scoring/benchmarks";

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
```

- [ ] **Step 4: Run the script and confirm all checks pass**

Run: `npm run verify:scoring`
Expected: every line prints `PASS: ...`, ending with `All scoring checks passed.`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-scoring.ts package.json package-lock.json
git commit -m "test: standalone scoring verification script (tsx, no jest/vitest)"
```

---

### Task 7: Expose `currentSnapshotId` on `SymbolDiff`

**Files:**
- Modify: `lib/watchlist/diff.ts:12-131`

- [ ] **Step 1: Add the field to the interface and populate it**

In `SymbolDiff` (around line 12), add one field after `symbol`:

```typescript
export interface SymbolDiff {
  symbol: string;
  isFirstView: boolean;
  /** The market_snapshots row id treated as "now" for this diff — the change_events dedup key. Null when no current snapshot exists yet. */
  currentSnapshotId: string | null;
  priceThen: number | null;
  priceNow: number | null;
  priceDelta: number | null;
  priceDeltaPct: number | null;
  volumeThen: number | null;
  volumeNow: number | null;
  timeElapsedMs: number | null;
  seenAt: string | null;
}
```

In the first-view return object (around line 97-108), add `currentSnapshotId: current?.id ?? null,` right after `isFirstView: true,`.

In the non-first-view return object (around line 118-129), add `currentSnapshotId: current?.id ?? null,` right after `isFirstView: false,`.

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add lib/watchlist/diff.ts
git commit -m "feat: expose currentSnapshotId on SymbolDiff for change_events dedup"
```

---

### Task 8: Batched daily_history loader

**Files:**
- Create: `lib/scoring/history.ts`

- [ ] **Step 1: Write the loader**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Loads recent daily_history rows for `symbols`, grouped by symbol and
 * sorted oldest-to-newest, capped at `perSymbolLimit` each. One bounded
 * query regardless of symbol count — same accepted pattern as the
 * `.limit(symbols.length * N)` queries already used in Phase 3/4 (grouping
 * happens in JS, not via a per-symbol DB round trip).
 */
export interface HistoryBar {
  date: string;
  close: number;
  volume: number | null;
}

export async function loadRecentHistory(
  supabase: SupabaseClient<Database>,
  symbols: string[],
  perSymbolLimit = 25,
): Promise<Map<string, HistoryBar[]>> {
  const result = new Map<string, HistoryBar[]>();
  if (symbols.length === 0) return result;

  const { data, error } = await supabase
    .from("daily_history")
    .select("symbol, date, close, volume")
    .in("symbol", symbols)
    .order("date", { ascending: false })
    .limit(symbols.length * perSymbolLimit);

  if (error) {
    console.error(`[loadRecentHistory] daily_history query failed: ${error.message}`);
    return result;
  }

  const bySymbolDesc = new Map<string, HistoryBar[]>();
  for (const row of data ?? []) {
    const bars = bySymbolDesc.get(row.symbol) ?? [];
    if (bars.length < perSymbolLimit) {
      bars.push({ date: row.date, close: row.close, volume: row.volume });
      bySymbolDesc.set(row.symbol, bars);
    }
  }

  for (const [symbol, barsDesc] of bySymbolDesc) {
    result.set(symbol, [...barsDesc].reverse()); // oldest-to-newest
  }
  return result;
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add lib/scoring/history.ts
git commit -m "feat: batched, bounded daily_history loader for scoring"
```

---

### Task 9: Orchestration — score diffs and persist change_events

**Files:**
- Create: `lib/scoring/compute-for-diffs.ts`

- [ ] **Step 1: Write the orchestration function**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { SymbolDiff } from "@/lib/watchlist/diff";
import {
  MARKET_BENCHMARK_SYMBOL,
  lookupSector,
  symbolsInSector,
} from "@/lib/market-data/sectors";
import { loadRecentHistory, type HistoryBar } from "@/lib/scoring/history";
import { computeVolatilityPct, computeAverageVolume } from "@/lib/scoring/volatility";
import { computeDailyMovePct, computeSectorBenchmarkPct } from "@/lib/scoring/benchmarks";
import { computeMeaningfulness, type MeaningfulnessResult } from "@/lib/scoring/score";

function closesOf(bars: HistoryBar[]): number[] {
  return bars.map((b) => b.close);
}
function volumesOf(bars: HistoryBar[]): (number | null)[] {
  return bars.map((b) => b.volume);
}

/**
 * Scores every non-first-view diff and upserts change_events keyed on
 * (user_id, symbol, snapshot_id) — dedupe-by-snapshot, so reloading
 * /watchlist repeatedly doesn't spam duplicate rows for the same underlying
 * change (Phase 5 design decision). Returns a Map so the diffs route can
 * merge results into its response without a second DB read.
 *
 * Skips: first-view diffs (nothing to score yet, phase5.md task 7) and any
 * diff with no currentSnapshotId (no snapshot exists yet to key the upsert
 * on).
 */
export async function computeAndPersistScores(
  supabase: SupabaseClient<Database>,
  userId: string,
  diffs: SymbolDiff[],
): Promise<Map<string, MeaningfulnessResult>> {
  const results = new Map<string, MeaningfulnessResult>();

  const scorable = diffs.filter(
    (d): d is SymbolDiff & { currentSnapshotId: string; priceDeltaPct: number } =>
      !d.isFirstView && d.currentSnapshotId !== null && d.priceDeltaPct !== null,
  );
  if (scorable.length === 0) return results;

  const symbols = scorable.map((d) => d.symbol);
  const sectorsNeeded = [
    ...new Set(symbols.map(lookupSector).filter((s): s is string => s !== null)),
  ];
  const sectorMemberSymbols = sectorsNeeded.flatMap(symbolsInSector);

  const allNeeded = [
    ...new Set([...symbols, MARKET_BENCHMARK_SYMBOL, ...sectorMemberSymbols]),
  ];
  const historyBySymbol = await loadRecentHistory(supabase, allNeeded);

  const marketDeltaPct = computeDailyMovePct(
    closesOf(historyBySymbol.get(MARKET_BENCHMARK_SYMBOL) ?? []),
  );

  const sectorDeltaBySector = new Map<string, number | null>();
  for (const sector of sectorsNeeded) {
    const memberCloses = symbolsInSector(sector).map((s) =>
      closesOf(historyBySymbol.get(s) ?? []),
    );
    sectorDeltaBySector.set(sector, computeSectorBenchmarkPct(memberCloses));
  }

  const rows: Database["public"]["Tables"]["change_events"]["Insert"][] = [];

  for (const diff of scorable) {
    const bars = historyBySymbol.get(diff.symbol) ?? [];
    const dailyVolPct = computeVolatilityPct(closesOf(bars));
    const volumeAvgRecent = computeAverageVolume(volumesOf(bars));
    const sectorName = lookupSector(diff.symbol);
    const sectorDeltaPct = sectorName
      ? (sectorDeltaBySector.get(sectorName) ?? null)
      : null;

    const result = computeMeaningfulness({
      priceDeltaPct: diff.priceDeltaPct,
      volumeNow: diff.volumeNow,
      volumeAvgRecent,
      dailyVolPct,
      marketDeltaPct,
      sectorDeltaPct,
      sectorName,
    });

    results.set(diff.symbol, result);
    rows.push({
      user_id: userId,
      symbol: diff.symbol,
      snapshot_id: diff.currentSnapshotId,
      meaningfulness_score: result.score,
      magnitude: diff.priceDeltaPct,
      confidence: result.confidence,
      explanation: result.explanation,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from("change_events")
      .upsert(rows, { onConflict: "user_id,symbol,snapshot_id" });
    if (error) {
      console.error(`[computeAndPersistScores] change_events upsert failed: ${error.message}`);
    }
  }

  return results;
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add lib/scoring/compute-for-diffs.ts
git commit -m "feat: orchestrate scoring + change_events upsert for diffs"
```

---

### Task 10: Wire scoring into the diffs API route

**Files:**
- Modify: `app/api/watchlist/diffs/route.ts`

- [ ] **Step 1: Merge scores into the response**

Replace the full file with:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computeDiffsForUser } from "@/lib/watchlist/diff";
import { computeAndPersistScores } from "@/lib/scoring/compute-for-diffs";

/**
 * GET /api/watchlist/diffs
 *
 * Returns the raw diff for every symbol in the current user's watchlist in
 * one response — one query round-trip set (3 queries total, see
 * computeDiffsForUser), not one request per symbol. This is what the
 * /watchlist page's client-side diff panel calls on mount.
 *
 * Phase 5: also computes and persists a meaningfulness score/bucket/
 * confidence/explanation for every non-first-view diff, merged into each
 * diff's response object. First-view diffs get none of these fields.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data: items, error } = await supabase
    .from("watchlist_items")
    .select("symbol")
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const symbols = [...new Set((items ?? []).map((i) => i.symbol))];
  const diffs = await computeDiffsForUser(supabase, userId, symbols);
  const scores = await computeAndPersistScores(supabase, userId, diffs);

  const merged = diffs.map((diff) => {
    const score = scores.get(diff.symbol);
    if (!score) return diff;
    return {
      ...diff,
      score: score.score,
      bucket: score.bucket,
      confidence: score.confidence,
      explanation: score.explanation,
    };
  });

  return NextResponse.json({ diffs: merged });
}
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Run `npx next build`**

Expected: compiles successfully, 0 errors, `/api/watchlist/diffs` still listed as a dynamic (ƒ) route.

- [ ] **Step 4: Commit**

```bash
git add app/api/watchlist/diffs/route.ts
git commit -m "feat: wire meaningfulness scoring into GET /api/watchlist/diffs"
```

---

### Task 11: Show score/bucket on the diff line (plain text, per phase5.md's "no digest UI polish")

**Files:**
- Modify: `components/watchlist/diff-panel.tsx`

- [ ] **Step 1: Extend the response type and render the score**

Replace the full file with:

```typescript
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { markWatchlistSeen } from "@/app/(protected)/watchlist/actions";
import { formatElapsed } from "@/lib/watchlist/format-elapsed";
import type { SymbolDiff } from "@/lib/watchlist/diff";
import type { Bucket, Confidence, Explanation } from "@/lib/scoring/score";

/** SymbolDiff plus the Phase 5 fields the diffs API merges in for non-first-view symbols. */
type ScoredDiff = SymbolDiff & {
  score?: number;
  bucket?: Bucket;
  confidence?: Confidence;
  explanation?: Explanation;
};

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

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: exit 0, no output.

- [ ] **Step 3: Run `npx next build`**

Expected: compiles successfully, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add components/watchlist/diff-panel.tsx
git commit -m "feat: show meaningfulness score/bucket/confidence on DiffLine"
```

---

### Task 12: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: compiled successfully, 0 errors.

- [ ] **Step 3: Scoring verification script**

Run: `npm run verify:scoring`
Expected: all `PASS:` lines, `All scoring checks passed.`, exit 0.

- [ ] **Step 4: Update `context.md`**

Add a "Current state — Phase 5" section (replacing the existing design-only
one) documenting: what's built (mirror the table style of Phase 3/4
sections), the manual/browser tests still outstanding from phase5.md's
TESTING list (items 5, 7, 8 need a real browser + real multi-day data and
are the user's job), the weights/thresholds chosen and why, and any
deviations from spec (e.g. the `tsx` devDependency addition, the
sector-omitted-from-score redistribute-to-zero choice).

- [ ] **Step 5: Commit the context update**

```bash
git add context.md
git commit -m "docs: Phase 5 context update — scoring engine built, manual tests outstanding"
```

---

## What this plan does NOT cover (explicitly out of scope, per phase5.md)

- Digest UI redesign — that's Phase 6, already spec'd in `phase6.md`, to be
  brainstormed/planned as its own cycle once this phase's manual steps
  (phase5.md's 4 manual steps: reviewing the sector mapping, tuning
  weights/thresholds against real data, deciding final thresholds, watching
  for a real demo-worthy move) are done.
- Thesis logic, news/corporate-event signals.
- Automated jest/vitest test suite — `scripts/verify-scoring.ts` + `tsc` +
  `next build` is this repo's established verification pattern (Phase 2-4
  precedent), extended minimally with `tsx` to satisfy phase5.md's explicit
  unit-test acceptance criteria.
