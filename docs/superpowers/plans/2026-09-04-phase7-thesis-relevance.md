# Phase 7 — Personal Thesis + AI Relevance Check — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For any flagged (Urgent/Notable) stock with a user-provided thesis, run one Gemini call (via Inngest `step.ai.infer`) judging whether recent Finnhub news supports/contradicts/is neutral to that thesis, store it in `change_events`, and surface it in the digest — without ever touching the Phase 5 deterministic score.

**Architecture:** New `lib/thesis/*` (pure prompt/parse/selection logic) + `lib/news/finnhub-news.ts` (Finnhub company-news fetch) + a new Inngest function fired from `app/api/watchlist/diffs/route.ts` right after Phase 5 scoring persists each `change_events` row. The route selects at most 5 eligible candidates (Urgent/Notable, has a thesis, not yet assessed), sends one idempotent Inngest event per candidate, and returns immediately — the digest never blocks on AI latency. The client polls the diffs route every 5s while any thesis is still pending, which is safe (no duplicate model calls) because each Inngest event carries a `${userId}:${symbol}:${changeEventId}` id and Inngest de-dupes by id.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase, Inngest v4 (`step.ai.infer` + `step.ai.models.gemini`, `@inngest/ai` — confirmed installed and supports Gemini's native `responseMimeType: "application/json"` + `responseSchema`), Finnhub `/company-news`.

Full design rationale: `docs/superpowers/specs/2026-09-04-phase7-thesis-relevance-design.md`.

No test runner in this repo (Phase 2-6 precedent) — "tests" below are `npm run verify:thesis` (new pure-logic script, same pattern as `verify-digest.ts`/`verify-scoring.ts`) plus `tsc --noEmit` / `next build`.

---

### Task 1: Env var scaffold

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add the Gemini section**

Append to the end of `.env.example`:

```bash

# ---- AI thesis relevance (Phase 7) ----
# The ONE place this product calls an LLM: judges whether recent news
# supports/contradicts a user's stated thesis for a flagged stock. Get a key
# at https://aistudio.google.com/apikey. Server-only — used inside an
# Inngest function via step.ai.infer, never exposed to the browser.
GEMINI_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add GEMINI_API_KEY to .env.example (Phase 7)"
```

---

### Task 2: Thesis types

**Files:**
- Create: `lib/thesis/types.ts`

- [ ] **Step 1: Write the file**

```typescript
/**
 * Shared types for Phase 7's thesis-relevance layer. Kept separate from
 * lib/scoring/score.ts's Explanation/Bucket/Confidence types — the thesis
 * verdict is an additive, optional layer on top of the deterministic score,
 * never merged into it (phase7.md's core architectural constraint).
 */

export type ThesisVerdictCategory =
  | "supports"
  | "contradicts"
  | "unclear"
  | "no_new_information"
  | "unavailable";

export interface ThesisSignal {
  source: string;
  assessment: "supports" | "contradicts" | "neutral";
  reasoning: string;
}

/** Stored at change_events.explanation.thesis_analysis; verdict is duplicated onto change_events.thesis_verdict for simple querying. */
export interface ThesisAnalysis {
  verdict: ThesisVerdictCategory;
  summary: string;
  signals: ThesisSignal[];
  newsWindow: { days: number; articleCount: number };
  assessedAt: string;
  model: string;
}

export interface NewsArticle {
  headline: string;
  summary: string;
  source: string;
  /** Unix seconds, matches Finnhub's own field shape. */
  datetime: number;
}

/** What the diffs API merges onto a ScoredDiff for a thesis-bearing stock. verdict: null means "not yet assessed" (checking...). */
export interface ThesisField {
  text: string;
  verdict: ThesisVerdictCategory | null;
  summary: string | null;
  signals: ThesisSignal[];
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add lib/thesis/types.ts
git commit -m "feat: Phase 7 thesis types"
```

---

### Task 3: Defensive verdict parser

**Files:**
- Create: `lib/thesis/parse-verdict.ts`
- Create: `scripts/verify-thesis.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-thesis.ts`:

```typescript
/**
 * Standalone verification for lib/thesis — no jest/vitest in this repo
 * (Phase 2-6 precedent). Run with `npm run verify:thesis`.
 */
import { parseVerdictResponse } from "../lib/thesis/parse-verdict";

let failures = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`PASS: ${message}`);
  }
}

const meta = { days: 5, articleCount: 2, model: "gemini-2.5-flash" };

// --- parseVerdictResponse ---------------------------------------------------
assert(
  parseVerdictResponse(undefined, meta).verdict === "unavailable",
  "parseVerdictResponse: undefined input -> unavailable",
);

assert(
  parseVerdictResponse("not json{{{", meta).verdict === "unavailable",
  "parseVerdictResponse: invalid JSON -> unavailable",
);

assert(
  parseVerdictResponse("42", meta).verdict === "unavailable",
  "parseVerdictResponse: non-object JSON -> unavailable",
);

assert(
  parseVerdictResponse(JSON.stringify({ summary: "x", signals: [] }), meta).verdict === "unavailable",
  "parseVerdictResponse: missing verdict field -> unavailable",
);

assert(
  parseVerdictResponse(JSON.stringify({ verdict: "made_up", summary: "x", signals: [] }), meta).verdict ===
    "unavailable",
  "parseVerdictResponse: invalid verdict enum value -> unavailable",
);

const goodResponse = parseVerdictResponse(
  JSON.stringify({
    verdict: "supports",
    summary: "EV demand still strong.",
    signals: [{ source: "Reuters: EV sales up", assessment: "supports", reasoning: "Sales beat estimates." }],
  }),
  meta,
);
assert(goodResponse.verdict === "supports", "parseVerdictResponse: valid response parses verdict");
assert(goodResponse.signals.length === 1, "parseVerdictResponse: valid response parses signals");
assert(goodResponse.newsWindow.articleCount === 2, "parseVerdictResponse: newsWindow carries through meta");

const malformedSignal = parseVerdictResponse(
  JSON.stringify({ verdict: "unclear", summary: "x", signals: [{ source: "a" }] }),
  meta,
);
assert(
  malformedSignal.signals[0].assessment === "neutral" && malformedSignal.signals[0].reasoning === "",
  "parseVerdictResponse: signal with missing fields defaults safely instead of throwing",
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll thesis checks passed.");
}
```

- [ ] **Step 2: Add the npm script**

In `package.json`'s `"scripts"` block, add (after `"verify:digest"`):

```json
    "verify:thesis": "tsx scripts/verify-thesis.ts"
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm run verify:thesis`
Expected: FAIL — `Cannot find module '../lib/thesis/parse-verdict'` (file doesn't exist yet).

- [ ] **Step 4: Implement the parser**

Create `lib/thesis/parse-verdict.ts`:

```typescript
import type { ThesisAnalysis, ThesisSignal, ThesisVerdictCategory } from "./types";

const VALID_VERDICTS: ThesisVerdictCategory[] = [
  "supports",
  "contradicts",
  "unclear",
  "no_new_information",
  "unavailable",
];
const VALID_ASSESSMENTS: ThesisSignal["assessment"][] = ["supports", "contradicts", "neutral"];

function unavailable(
  meta: { days: number; articleCount: number; model: string },
  reason: string,
): ThesisAnalysis {
  return {
    verdict: "unavailable",
    summary: `Verdict unavailable: ${reason}`,
    signals: [],
    newsWindow: { days: meta.days, articleCount: meta.articleCount },
    assessedAt: new Date().toISOString(),
    model: meta.model,
  };
}

/**
 * Defensively parses the model's JSON response into a ThesisAnalysis.
 * Never throws — any missing/malformed field degrades to a `"unavailable"`
 * verdict rather than crashing or showing garbled text (phase7.md task 2c).
 * Gemini is asked for `responseMimeType: "application/json"` +
 * `responseSchema` (see lib/thesis/prompt.ts), so malformed JSON should be
 * rare in practice — this is the defense-in-depth layer for when it isn't.
 */
export function parseVerdictResponse(
  rawText: string | undefined,
  meta: { days: number; articleCount: number; model: string },
): ThesisAnalysis {
  if (!rawText) return unavailable(meta, "empty model response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return unavailable(meta, "model response was not valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return unavailable(meta, "model response was not a JSON object");
  }
  const obj = parsed as Record<string, unknown>;

  const verdict = obj.verdict;
  if (typeof verdict !== "string" || !VALID_VERDICTS.includes(verdict as ThesisVerdictCategory)) {
    return unavailable(meta, "model response had no valid verdict field");
  }

  const summary = typeof obj.summary === "string" ? obj.summary : "";

  const signals: ThesisSignal[] = Array.isArray(obj.signals)
    ? obj.signals
        .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
        .map((s) => ({
          source: typeof s.source === "string" ? s.source : "unknown",
          assessment: VALID_ASSESSMENTS.includes(s.assessment as ThesisSignal["assessment"])
            ? (s.assessment as ThesisSignal["assessment"])
            : "neutral",
          reasoning: typeof s.reasoning === "string" ? s.reasoning : "",
        }))
    : [];

  return {
    verdict: verdict as ThesisVerdictCategory,
    summary,
    signals,
    newsWindow: { days: meta.days, articleCount: meta.articleCount },
    assessedAt: new Date().toISOString(),
    model: meta.model,
  };
}
```

- [ ] **Step 5: Run the verification script again**

Run: `npm run verify:thesis`
Expected: `All thesis checks passed.`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/thesis/parse-verdict.ts scripts/verify-thesis.ts package.json
git commit -m "feat: defensive Gemini thesis-verdict parser"
```

---

### Task 4: Cost-control candidate selection

**Files:**
- Create: `lib/thesis/trigger.ts`
- Modify: `scripts/verify-thesis.ts`

- [ ] **Step 1: Extend the verification script with failing assertions**

Add to `scripts/verify-thesis.ts`, before the final `if (failures > 0)` block, and add the import at the top alongside the existing one:

```typescript
import { selectThesisChecksToRun, type ThesisCandidate } from "../lib/thesis/trigger";
```

```typescript
// --- selectThesisChecksToRun -------------------------------------------------
function candidate(overrides: Partial<ThesisCandidate>): ThesisCandidate {
  return {
    symbol: "TEST",
    bucket: "Urgent",
    score: 1,
    changeEventId: "evt-1",
    existingThesisVerdict: null,
    thesisText: "some thesis",
    ...overrides,
  };
}

assert(
  selectThesisChecksToRun([candidate({ bucket: "Routine" })]).length === 0,
  "selectThesisChecksToRun: excludes Routine bucket",
);
assert(
  selectThesisChecksToRun([candidate({ thesisText: null })]).length === 0,
  "selectThesisChecksToRun: excludes stocks with no thesis",
);
assert(
  selectThesisChecksToRun([candidate({ thesisText: "   " })]).length === 0,
  "selectThesisChecksToRun: excludes whitespace-only thesis",
);
assert(
  selectThesisChecksToRun([candidate({ existingThesisVerdict: "supports" })]).length === 0,
  "selectThesisChecksToRun: excludes already-assessed change events",
);
assert(
  selectThesisChecksToRun([candidate({ changeEventId: null })]).length === 0,
  "selectThesisChecksToRun: excludes diffs with no change event id",
);

const many: ThesisCandidate[] = Array.from({ length: 8 }, (_, i) => candidate({ symbol: `S${i}`, score: i }));
const selected = selectThesisChecksToRun(many, 5);
assert(selected.length === 5, "selectThesisChecksToRun: respects the cap");
assert(
  selected.map((c) => c.symbol).join(",") === "S7,S6,S5,S4,S3",
  "selectThesisChecksToRun: picks highest score first",
);
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run verify:thesis`
Expected: FAIL — `Cannot find module '../lib/thesis/trigger'`.

- [ ] **Step 3: Implement the selector**

Create `lib/thesis/trigger.ts`:

```typescript
import type { Bucket } from "@/lib/scoring/score";

export interface ThesisCandidate {
  symbol: string;
  bucket: Bucket;
  score: number;
  /** null when nothing was persisted for this diff (e.g. the change_events upsert failed) — never eligible. */
  changeEventId: string | null;
  /** The change event's current thesis_verdict, straight from the DB. Non-null means already assessed. */
  existingThesisVerdict: string | null;
  thesisText: string | null;
}

const FLAGGED_BUCKETS: Bucket[] = ["Urgent", "Notable"];

/**
 * Which flagged, thesis-bearing stocks get a fresh AI thesis check this
 * diffs-API call. Cost control (phase7.md task 3): only stocks with no
 * existing verdict for their current change event, capped at `cap`,
 * highest-score first. A stock that doesn't make the cut waits for a future
 * change event (e.g. the next snapshot's diff), not this one — see the
 * design doc's Cost/rate control section for why this is safe under polling.
 */
export function selectThesisChecksToRun(
  candidates: ThesisCandidate[],
  cap = 5,
): ThesisCandidate[] {
  return candidates
    .filter(
      (c) =>
        FLAGGED_BUCKETS.includes(c.bucket) &&
        c.changeEventId !== null &&
        c.existingThesisVerdict === null &&
        (c.thesisText ?? "").trim().length > 0,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, cap);
}
```

- [ ] **Step 4: Run the verification script again**

Run: `npm run verify:thesis`
Expected: `All thesis checks passed.`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/thesis/trigger.ts scripts/verify-thesis.ts
git commit -m "feat: cap/priority selection for thesis-relevance calls"
```

---

### Task 5: Prompt + structured-output schema builder

**Files:**
- Create: `lib/thesis/prompt.ts`
- Modify: `scripts/verify-thesis.ts`

- [ ] **Step 1: Extend the verification script with failing assertions**

Add to `scripts/verify-thesis.ts` (import at top, assertions before the final block):

```typescript
import { buildThesisPrompt } from "../lib/thesis/prompt";
import type { Explanation } from "../lib/scoring/score";
```

```typescript
// --- buildThesisPrompt -------------------------------------------------------
const sampleExplanation: Explanation = {
  price_change_pct: 6.2,
  price_zscore: 2.1,
  volume_ratio: 3.4,
  market_change_pct: 0.5,
  sector_change_pct: 0.8,
  sector_used: "IT",
  data_completeness: "full",
};

const promptWithNews = buildThesisPrompt(
  "EV growth + margin improvement",
  "Acme Motors",
  [{ headline: "Acme beats delivery estimates", summary: "Q3 deliveries up 20%.", source: "Reuters", datetime: 1700000000 }],
  sampleExplanation,
);
assert(promptWithNews.contents.length === 1, "buildThesisPrompt: produces one content block");
assert(
  promptWithNews.contents[0].parts[0].text.includes("EV growth + margin improvement"),
  "buildThesisPrompt: includes the thesis text",
);
assert(
  promptWithNews.contents[0].parts[0].text.includes("Acme beats delivery estimates"),
  "buildThesisPrompt: includes news headlines",
);
assert(
  promptWithNews.generationConfig.responseMimeType === "application/json",
  "buildThesisPrompt: forces JSON output via responseMimeType",
);

const promptNoNews = buildThesisPrompt("EV growth", "Acme Motors", [], sampleExplanation);
assert(
  promptNoNews.contents[0].parts[0].text.includes("No recent news"),
  "buildThesisPrompt: states plainly when there is no news, instead of omitting the gap",
);
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run verify:thesis`
Expected: FAIL — `Cannot find module '../lib/thesis/prompt'`.

- [ ] **Step 3: Implement the prompt builder**

Create `lib/thesis/prompt.ts`:

```typescript
import type { Explanation } from "@/lib/scoring/score";
import type { NewsArticle } from "./types";

/** Matches the shape step.ai.infer expects as `body` for a Gemini model (GenerateContentRequest). */
export interface ThesisPromptRequest {
  contents: Array<{ role: "user"; parts: Array<{ text: string }> }>;
  generationConfig: {
    responseMimeType: "application/json";
    responseSchema: object;
    temperature: number;
  };
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["supports", "contradicts", "unclear", "no_new_information", "unavailable"],
    },
    summary: { type: "string" },
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          assessment: { type: "string", enum: ["supports", "contradicts", "neutral"] },
          reasoning: { type: "string" },
        },
        required: ["source", "assessment", "reasoning"],
      },
    },
  },
  required: ["verdict", "summary", "signals"],
};

/**
 * Pure prompt builder — no I/O, testable in isolation. Exact wording is a
 * deliberate manual-tuning target (phase7.md MANUAL STEPS #2), not frozen by
 * this function; only the schema-enforced output shape is load-bearing.
 * Uses Gemini's native structured-output support (responseMimeType +
 * responseSchema) rather than relying on prompt instructions alone to
 * produce valid JSON.
 */
export function buildThesisPrompt(
  thesisText: string,
  companyName: string | null,
  articles: NewsArticle[],
  explanation: Explanation,
): ThesisPromptRequest {
  const newsBlock =
    articles.length === 0
      ? "No recent news articles were found for this stock in the last few days."
      : articles.map((a, i) => `${i + 1}. [${a.source}] ${a.headline}\n   ${a.summary}`).join("\n");

  const marketLine =
    explanation.market_change_pct !== null
      ? `Stock moved ${explanation.price_change_pct.toFixed(2)}% vs Nifty 50 ${explanation.market_change_pct.toFixed(2)}%.`
      : `Stock moved ${explanation.price_change_pct.toFixed(2)}%; no market comparison available.`;
  const sectorLine =
    explanation.sector_used !== null && explanation.sector_change_pct !== null
      ? `Sector (${explanation.sector_used}) moved ${explanation.sector_change_pct.toFixed(2)}%.`
      : "No sector comparison available.";
  const volumeLine =
    explanation.volume_ratio !== null
      ? `Trading volume was ${explanation.volume_ratio.toFixed(1)}x the recent average.`
      : "No volume comparison available.";

  const text = `You are a sharp equity research analyst. A user is watching ${companyName ?? "this stock"} for this stated reason:

"${thesisText}"

The stock was just flagged as a meaningful mover. Market context:
${marketLine}
${sectorLine}
${volumeLine}

Recent news (last few days):
${newsBlock}

Judge whether this new information supports, contradicts, or does not clearly affect the user's stated thesis. If there is no relevant new information, say so plainly with verdict "no_new_information" rather than inventing a confident-sounding answer — no fabricated confidence. Give one assessment per news item (or one item using "price/volume/sector context" as the source if there is no news) plus one overall verdict and a one-line summary.`;

  return {
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  };
}
```

- [ ] **Step 4: Run the verification script again**

Run: `npm run verify:thesis`
Expected: `All thesis checks passed.`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/thesis/prompt.ts scripts/verify-thesis.ts
git commit -m "feat: thesis-relevance prompt + structured-output schema"
```

---

### Task 6: Finnhub company-news fetch

**Files:**
- Create: `lib/news/finnhub-news.ts`

- [ ] **Step 1: Write the file**

```typescript
import "server-only";
import type { NewsArticle } from "@/lib/thesis/types";

const NEWS_URL = "https://finnhub.io/api/v1/company-news";
const TIMEOUT_MS = 6000;

interface FinnhubNewsItem {
  headline?: string;
  summary?: string;
  source?: string;
  datetime?: number;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Recent company news for a thesis-relevance check (phase7.md task 1).
 * Returns [] — not an error — when Finnhub has nothing for this
 * symbol/window. That's the expected, common case for quieter stocks, and
 * also covers symbols Finnhub doesn't support at all (e.g. NSE-listed
 * stocks — same limitation as lib/market-data/sources/finnhub.ts's quote
 * support). An empty array here is what lets the prompt state "no recent
 * news" plainly instead of the caller needing a separate error path.
 */
export async function getCompanyNews(
  symbol: string,
  { days = 5, maxArticles = 5 }: { days?: number; maxArticles?: number } = {},
): Promise<NewsArticle[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return [];

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const url = `${NEWS_URL}?symbol=${encodeURIComponent(symbol)}&from=${isoDate(from)}&to=${isoDate(to)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      // Header, not query string — keeps the key out of any logged URL.
      headers: { "X-Finnhub-Token": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    console.warn(
      `[getCompanyNews] ${symbol} fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }

  if (!res.ok) {
    console.warn(`[getCompanyNews] ${symbol} HTTP ${res.status}`);
    return [];
  }

  let items: FinnhubNewsItem[];
  try {
    items = (await res.json()) as FinnhubNewsItem[];
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];

  return items
    .filter(
      (i): i is Required<FinnhubNewsItem> =>
        typeof i.headline === "string" &&
        typeof i.summary === "string" &&
        typeof i.source === "string" &&
        typeof i.datetime === "number",
    )
    .sort((a, b) => b.datetime - a.datetime)
    .slice(0, maxArticles)
    .map((i) => ({ headline: i.headline, summary: i.summary, source: i.source, datetime: i.datetime }));
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add lib/news/finnhub-news.ts
git commit -m "feat: Finnhub company-news fetch for thesis relevance"
```

---

### Task 7: Add thesis field to ScoredDiff

**Files:**
- Modify: `lib/watchlist/scored-diff.ts`

- [ ] **Step 1: Add the field**

Full new content of `lib/watchlist/scored-diff.ts`:

```typescript
import type { SymbolDiff } from "@/lib/watchlist/diff";
import type { Bucket, Confidence, Explanation } from "@/lib/scoring/score";
import type { ThesisField } from "@/lib/thesis/types";

/** SymbolDiff plus the Phase 5 fields and Phase 7's thesis field the diffs API merges in for non-first-view symbols. */
export type ScoredDiff = SymbolDiff & {
  score?: number;
  bucket?: Bucket;
  confidence?: Confidence;
  explanation?: Explanation;
  /** null when the stock has no thesis; verdict: null inside means "not yet assessed". */
  thesis?: ThesisField | null;
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add lib/watchlist/scored-diff.ts
git commit -m "feat: add thesis field to ScoredDiff"
```

---

### Task 8: Preserve thesis_analysis across re-scoring + expose change_event identity

**Files:**
- Modify: `lib/scoring/compute-for-diffs.ts`

This is the one correctness-critical change in this phase: `computeAndPersistScores` runs on *every* diffs fetch, including the client's 5s thesis-verdict poll (Task 12). Its upsert writes the whole `explanation` jsonb column — if it always wrote only the Phase 5 fields, a poll firing after the Inngest job has already written `thesis_analysis` into that column would silently wipe it back out. This task fixes that by reading back any existing `thesis_analysis` before each upsert and carrying it forward, and exposes each diff's `change_events` row id + current `thesis_verdict` so the diffs route (Task 11) can decide what to trigger.

- [ ] **Step 1: Replace the file**

Full new content of `lib/scoring/compute-for-diffs.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
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
import type { ThesisSignal } from "@/lib/thesis/types";

function closesOf(bars: HistoryBar[]): number[] {
  return bars.map((b) => b.close);
}
function volumesOf(bars: HistoryBar[]): (number | null)[] {
  return bars.map((b) => b.volume);
}

/** Minimal view of a stored ThesisAnalysis — just what the digest UI needs to render. */
export interface ThesisAnalysisSummary {
  summary: string;
  signals: ThesisSignal[];
}

/** MeaningfulnessResult plus the change_events row identity and Phase 7 thesis state the diffs route needs. */
export interface ScoreWithMeta extends MeaningfulnessResult {
  /** null when the upsert failed or this diff had nothing to score — never eligible for a thesis check. */
  changeEventId: string | null;
  /** The change event's current thesis_verdict. null until Phase 7's Inngest job sets it. */
  thesisVerdict: string | null;
  /** null until a verdict has been persisted for this change event. */
  thesisAnalysis: ThesisAnalysisSummary | null;
}

/**
 * Scores every non-first-view diff and upserts change_events keyed on
 * (user_id, symbol, snapshot_id) — dedupe-by-snapshot, so reloading
 * /watchlist repeatedly doesn't spam duplicate rows for the same underlying
 * change (Phase 5 design decision). Returns a Map so the diffs route can
 * merge results into its response without a second DB read.
 *
 * Phase 7: this function runs on every diffs fetch, including the client's
 * thesis-verdict poll (see diff-panel.tsx). Re-upserting `explanation` with
 * only the Phase 5 fields would silently erase any `thesis_analysis` the
 * thesis-relevance Inngest job already wrote into that same jsonb column —
 * so existing rows for the exact (symbol, snapshot_id) pairs being upserted
 * are read first, and any existing `thesis_analysis` is carried forward into
 * the new explanation object before writing. The upsert's own `.select()`
 * then returns that preserved value straight back, so ScoreWithMeta.
 * thesisAnalysis always reflects current DB state without a second read.
 *
 * Note: if the change_events upsert fails, this still returns the in-memory
 * computed scores (logged, not thrown) — a caller should not assume a score
 * in the returned Map was durably persisted (changeEventId will be null in
 * that case). Also: any single diff whose inputs cause computeMeaningfulness
 * to throw (non-finite data) is logged and skipped, not fatal to the batch —
 * same partial-failure contract as the Inngest snapshot/history jobs.
 */
export async function computeAndPersistScores(
  supabase: SupabaseClient<Database>,
  userId: string,
  diffs: SymbolDiff[],
): Promise<Map<string, ScoreWithMeta>> {
  const results = new Map<string, ScoreWithMeta>();

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

  // Pre-fetch existing rows for the exact (symbol, snapshot_id) pairs about
  // to be upserted, so any Phase 7 thesis_analysis already written isn't
  // clobbered by this call's Phase 5 explanation write (see doc comment).
  const existingExplanationByKey = new Map<string, Json>();
  const snapshotIds = [...new Set(scorable.map((d) => d.currentSnapshotId))];
  const { data: existingRows, error: existingError } = await supabase
    .from("change_events")
    .select("symbol, snapshot_id, explanation")
    .eq("user_id", userId)
    .in("symbol", symbols)
    .in("snapshot_id", snapshotIds);
  if (existingError) {
    console.error(`[computeAndPersistScores] existing-rows query failed: ${existingError.message}`);
  }
  for (const row of existingRows ?? []) {
    if (row.snapshot_id && row.explanation) {
      existingExplanationByKey.set(`${row.symbol}:${row.snapshot_id}`, row.explanation);
    }
  }

  const rows: Database["public"]["Tables"]["change_events"]["Insert"][] = [];

  for (const diff of scorable) {
    try {
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

      results.set(diff.symbol, {
        ...result,
        changeEventId: null,
        thesisVerdict: null,
        thesisAnalysis: null,
      });

      const existingExplanation = existingExplanationByKey.get(`${diff.symbol}:${diff.currentSnapshotId}`);
      const existingThesisAnalysis =
        existingExplanation && typeof existingExplanation === "object" && !Array.isArray(existingExplanation)
          ? (existingExplanation as Record<string, Json | undefined>).thesis_analysis
          : undefined;

      const explanation: Json =
        existingThesisAnalysis !== undefined
          ? ({
              ...(result.explanation as unknown as Record<string, Json>),
              thesis_analysis: existingThesisAnalysis,
            } as Json)
          : (result.explanation as unknown as Json);

      rows.push({
        user_id: userId,
        symbol: diff.symbol,
        snapshot_id: diff.currentSnapshotId,
        meaningfulness_score: result.score,
        magnitude: diff.priceDeltaPct,
        confidence: result.confidence,
        explanation,
      });
    } catch (err) {
      // One symbol's bad/non-finite data must not take down every other
      // symbol's score — same "log and skip, never fatal" contract as
      // snapshot-ingest.ts / daily-history-backfill.ts.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[computeAndPersistScores] skipped ${diff.symbol}: ${message}`);
    }
  }

  if (rows.length > 0) {
    const { data: upserted, error } = await supabase
      .from("change_events")
      .upsert(rows, { onConflict: "user_id,symbol,snapshot_id" })
      .select("id, symbol, thesis_verdict, explanation");
    if (error) {
      console.error(`[computeAndPersistScores] change_events upsert failed: ${error.message}`);
    }
    for (const row of upserted ?? []) {
      const existing = results.get(row.symbol);
      if (!existing) continue;

      let thesisAnalysis: ThesisAnalysisSummary | null = null;
      if (row.explanation && typeof row.explanation === "object" && !Array.isArray(row.explanation)) {
        const ta = (row.explanation as Record<string, unknown>).thesis_analysis;
        if (ta && typeof ta === "object") {
          const t = ta as Record<string, unknown>;
          thesisAnalysis = {
            summary: typeof t.summary === "string" ? t.summary : "",
            signals: Array.isArray(t.signals) ? (t.signals as ThesisSignal[]) : [],
          };
        }
      }

      results.set(row.symbol, {
        ...existing,
        changeEventId: row.id,
        thesisVerdict: row.thesis_verdict,
        thesisAnalysis,
      });
    }
  }

  return results;
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck`
Expected: exit 0, no output.

Run: `npm run build`
Expected: compiles successfully, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/scoring/compute-for-diffs.ts
git commit -m "fix: preserve thesis_analysis across re-scoring, expose change_event id"
```

---

### Task 9: Thesis-relevance Inngest function

**Files:**
- Create: `lib/inngest/functions/thesis-relevance.ts`

- [ ] **Step 1: Write the file**

```typescript
import "server-only";
import { inngest } from "@/lib/inngest/client";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getCompanyNews } from "@/lib/news/finnhub-news";
import { buildThesisPrompt } from "@/lib/thesis/prompt";
import { parseVerdictResponse } from "@/lib/thesis/parse-verdict";
import type { ThesisAnalysis } from "@/lib/thesis/types";
import type { Explanation } from "@/lib/scoring/score";
import type { Json } from "@/types/database";

const MODEL = "gemini-2.5-flash";
const NEWS_DAYS = 5;
const NEWS_MAX_ARTICLES = 5;

interface ThesisRelevanceEventData {
  userId: string;
  symbol: string;
  companyName: string | null;
  thesisText: string;
  changeEventId: string;
  explanation: Explanation;
}

/**
 * Judges whether recent news supports/contradicts/is neutral to a user's
 * stated thesis for one flagged stock. Fired by
 * app/api/watchlist/diffs/route.ts, which already applied the cost controls
 * (cap 5, score-priority, already-assessed exclusion — phase7.md task 3)
 * before sending this event. Never touches meaningfulness_score/bucket —
 * this is a fully separate, additive layer (phase7.md's core architectural
 * constraint: the AI verdict must never feed back into the deterministic
 * score).
 */
export const thesisRelevance = inngest.createFunction(
  {
    id: "thesis-relevance-check",
    name: "Thesis relevance check",
    triggers: [{ event: "thesis/relevance.requested" }],
  },
  async ({ event, step }) => {
    const { symbol, companyName, thesisText, changeEventId, explanation } =
      event.data as ThesisRelevanceEventData;

    // Race guard: the diffs route only sends this event when thesis_verdict
    // is null, but the client polls every 5s and Inngest's event-id dedup is
    // best-effort — re-check here before spending an AI call, in case a
    // previous run for this exact change event already finished between
    // send and now.
    const alreadyAssessed = await step.run("check-not-already-assessed", async () => {
      const supabase = createAdminSupabaseClient();
      const { data } = await supabase
        .from("change_events")
        .select("thesis_verdict")
        .eq("id", changeEventId)
        .maybeSingle();
      return Boolean(data?.thesis_verdict);
    });
    if (alreadyAssessed) {
      return { skipped: true, reason: "already assessed" };
    }

    const articles = await step.run("fetch-news", () =>
      getCompanyNews(symbol, { days: NEWS_DAYS, maxArticles: NEWS_MAX_ARTICLES }),
    );

    let analysis: ThesisAnalysis;
    try {
      const prompt = buildThesisPrompt(thesisText, companyName, articles, explanation);
      const response = await step.ai.infer("gemini-verdict", {
        model: step.ai.models.gemini({ model: MODEL }),
        body: prompt,
      });
      const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text;
      analysis = parseVerdictResponse(rawText, {
        days: NEWS_DAYS,
        articleCount: articles.length,
        model: MODEL,
      });
    } catch (err) {
      // Bad/missing API key, quota exhaustion, network failure — degrade
      // gracefully (phase7.md test 7) rather than crash or retry forever.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[thesis-relevance] ${symbol} model call failed: ${message}`);
      analysis = {
        verdict: "unavailable",
        summary: `Verdict unavailable: ${message}`,
        signals: [],
        newsWindow: { days: NEWS_DAYS, articleCount: articles.length },
        assessedAt: new Date().toISOString(),
        model: MODEL,
      };
    }

    await step.run("persist-verdict", async () => {
      const supabase = createAdminSupabaseClient();
      const { data: current } = await supabase
        .from("change_events")
        .select("explanation")
        .eq("id", changeEventId)
        .maybeSingle();

      const baseExplanation =
        current?.explanation && typeof current.explanation === "object" && !Array.isArray(current.explanation)
          ? (current.explanation as Record<string, Json>)
          : {};

      const { error } = await supabase
        .from("change_events")
        .update({
          thesis_verdict: analysis.verdict,
          explanation: { ...baseExplanation, thesis_analysis: analysis as unknown as Json },
        })
        .eq("id", changeEventId);

      if (error) {
        console.error(`[thesis-relevance] ${symbol} persist failed: ${error.message}`);
      }
    });

    return { verdict: analysis.verdict, articleCount: articles.length };
  },
);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no output. (If `step.ai.infer`'s `body` type check fails against `ThesisPromptRequest`, confirm `@inngest/ai`'s `Gemini.GenerateContentRequest` — checked during design: `contents` required, everything else optional, structurally compatible.)

- [ ] **Step 3: Commit**

```bash
git add lib/inngest/functions/thesis-relevance.ts
git commit -m "feat: thesis-relevance Inngest function (Gemini via step.ai.infer)"
```

---

### Task 10: Register the function

**Files:**
- Modify: `app/api/inngest/route.ts`

- [ ] **Step 1: Add the import and register it**

Full new content of `app/api/inngest/route.ts`:

```typescript
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { snapshotIngest } from "@/lib/inngest/functions/snapshot-ingest";
import { dailyHistoryBackfill } from "@/lib/inngest/functions/daily-history-backfill";
import { thesisRelevance } from "@/lib/inngest/functions/thesis-relevance";

/**
 * Inngest's HTTP entrypoint. The dev server (`npm run inngest`) and Inngest
 * Cloud call this route server-to-server to sync functions and invoke runs.
 * It is NOT Clerk-protected — see middleware.ts (not in the protected
 * matcher).
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [snapshotIngest, dailyHistoryBackfill, thesisRelevance],
});
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: compiles successfully, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/inngest/route.ts
git commit -m "feat: register thesis-relevance-check on the inngest serve route"
```

---

### Task 11: Wire triggering + response merging into the diffs API

**Files:**
- Modify: `app/api/watchlist/diffs/route.ts`

- [ ] **Step 1: Replace the file**

Full new content of `app/api/watchlist/diffs/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computeDiffsForUser } from "@/lib/watchlist/diff";
import { computeAndPersistScores } from "@/lib/scoring/compute-for-diffs";
import { selectThesisChecksToRun, type ThesisCandidate } from "@/lib/thesis/trigger";
import { inngest } from "@/lib/inngest/client";
import type { ThesisField } from "@/lib/thesis/types";

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
 *
 * Phase 7: merges a `thesis` field (text + verdict, null verdict = "not yet
 * assessed") onto each thesis-bearing diff, and — for the highest-scoring up
 * to 5 flagged (Urgent/Notable) thesis-bearing stocks that haven't been
 * assessed yet — fires an idempotent `thesis/relevance.requested` Inngest
 * event (id `${userId}:${symbol}:${changeEventId}`, so repeated calls from
 * the client's 5s poll in diff-panel.tsx never trigger a duplicate model
 * call for the same change event). The event send is awaited (a fast local
 * call to the Inngest dev server/Cloud), but the Inngest function itself is
 * never awaited — this response always returns immediately regardless of
 * Gemini latency (phase7.md task 4's "never block the page load" rule).
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data: items, error } = await supabase
    .from("watchlist_items")
    .select("symbol, thesis, company_name")
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const symbols = [...new Set((items ?? []).map((i) => i.symbol))];
  const thesisBySymbol = new Map((items ?? []).map((i) => [i.symbol, (i.thesis ?? "").trim() || null]));
  const companyNameBySymbol = new Map((items ?? []).map((i) => [i.symbol, i.company_name]));

  const diffs = await computeDiffsForUser(supabase, userId, symbols);
  const scores = await computeAndPersistScores(supabase, userId, diffs);

  const candidates: ThesisCandidate[] = [...scores.entries()].map(([symbol, s]) => ({
    symbol,
    bucket: s.bucket,
    score: s.score,
    changeEventId: s.changeEventId,
    existingThesisVerdict: s.thesisVerdict,
    thesisText: thesisBySymbol.get(symbol) ?? null,
  }));
  const toRun = selectThesisChecksToRun(candidates);

  await Promise.all(
    toRun.map((c) => {
      const score = scores.get(c.symbol);
      if (!score || !c.changeEventId) return Promise.resolve();
      return inngest.send({
        id: `${userId}:${c.symbol}:${c.changeEventId}`,
        name: "thesis/relevance.requested",
        data: {
          userId,
          symbol: c.symbol,
          companyName: companyNameBySymbol.get(c.symbol) ?? null,
          thesisText: c.thesisText,
          changeEventId: c.changeEventId,
          explanation: score.explanation,
        },
      });
    }),
  );

  const merged = diffs.map((diff) => {
    const score = scores.get(diff.symbol);
    const thesisText = thesisBySymbol.get(diff.symbol);

    let thesis: ThesisField | null = null;
    if (thesisText && score) {
      thesis = {
        text: thesisText,
        verdict: (score.thesisVerdict as ThesisField["verdict"]) ?? null,
        summary: score.thesisAnalysis?.summary ?? null,
        signals: score.thesisAnalysis?.signals ?? [],
      };
    }

    if (!score) return { ...diff, thesis };
    return {
      ...diff,
      score: score.score,
      bucket: score.bucket,
      confidence: score.confidence,
      explanation: score.explanation,
      thesis,
    };
  });

  return NextResponse.json({ diffs: merged });
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: compiles successfully, `/api/watchlist/diffs` still a dynamic (ƒ) route, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/watchlist/diffs/route.ts
git commit -m "feat: trigger + merge thesis verdicts into the diffs API"
```

---

### Task 12: Client polling for pending thesis verdicts

**Files:**
- Modify: `components/watchlist/diff-panel.tsx`

- [ ] **Step 1: Replace the file**

Full new content of `components/watchlist/diff-panel.tsx`:

```typescript
"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { markWatchlistSeen } from "@/app/(protected)/watchlist/actions";
import { formatElapsed } from "@/lib/watchlist/format-elapsed";
import type { Bucket } from "@/lib/scoring/score";
import type { ScoredDiff } from "@/lib/watchlist/scored-diff";

interface DiffsState {
  diffs: Map<string, ScoredDiff> | null;
  loading: boolean;
}

const DiffsContext = createContext<DiffsState>({ diffs: null, loading: true });

const THESIS_POLL_INTERVAL_MS = 5000;
const THESIS_POLL_TIMEOUT_MS = 60000;

function hasPendingThesis(diffs: Map<string, ScoredDiff>): boolean {
  for (const diff of diffs.values()) {
    if (diff.thesis && diff.thesis.verdict === null) return true;
  }
  return false;
}

/**
 * Fetches GET /api/watchlist/diffs exactly once for the whole page (not once
 * per row), then fires markWatchlistSeen() only after the diffs are in state
 * and have had a chance to render — marking seen before showing the diff
 * would erase the very change being displayed. If the fetch fails,
 * markWatchlistSeen is never called, so a failed view doesn't consume the
 * unseen state.
 *
 * Phase 7: after the initial fetch, if any diff has a thesis still awaiting
 * a verdict (thesis.verdict === null), re-fetches every 5s so the "checking
 * against your thesis…" UI state updates without a manual reload — stops
 * once every pending thesis has resolved, or after 60s as a safety cutoff so
 * a stuck job doesn't poll forever. markWatchlistSeen is only ever fired
 * from the very first successful fetch, never from a poll.
 */
export function WatchlistDiffsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<DiffsState>({ diffs: null, loading: true });
  const pollStartRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function fetchOnce(isFirst: boolean) {
      try {
        const res = await fetch("/api/watchlist/diffs");
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body: { diffs: ScoredDiff[] } = await res.json();
        if (cancelled) return;

        const diffs = new Map(body.diffs.map((d) => [d.symbol, d]));
        setState({ diffs, loading: false });
        if (isFirst) await markWatchlistSeen();

        if (pollStartRef.current === null) pollStartRef.current = Date.now();
        const elapsed = Date.now() - pollStartRef.current;
        if (!cancelled && hasPendingThesis(diffs) && elapsed < THESIS_POLL_TIMEOUT_MS) {
          timer = setTimeout(() => fetchOnce(false), THESIS_POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled && isFirst) setState({ diffs: null, loading: false });
      }
    }

    fetchOnce(true);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return <DiffsContext.Provider value={state}>{children}</DiffsContext.Provider>;
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

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: compiles successfully, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add components/watchlist/diff-panel.tsx
git commit -m "feat: poll for pending thesis verdicts without blocking initial render"
```

---

### Task 13: Render thesis on the digest card

**Files:**
- Modify: `components/digest/stock-card.tsx`

- [ ] **Step 1: Replace the file**

Full new content of `components/digest/stock-card.tsx`:

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

/** verdict === null (still checking) uses the "pending" key. */
const THESIS_STATUS_LABEL: Record<string, string> = {
  supports: "Mostly intact",
  contradicts: "Contradicted",
  unclear: "Unclear",
  no_new_information: "No new information",
  unavailable: "Unavailable",
  pending: "Checking against your thesis…",
};
const THESIS_STATUS_COLOR: Record<string, string> = {
  supports: "text-green-700",
  contradicts: "text-red-700",
  unclear: "text-amber-700",
  no_new_information: "text-gray-500",
  unavailable: "text-gray-400",
  pending: "text-gray-400",
};

/**
 * Full card for an Urgent/Notable stock: symbol/name, price + % since last
 * seen, time since last seen, a one-line interpretation, and an expandable
 * full evidence trail (phase6.md task 2/3).
 *
 * Phase 7: if the stock has a thesis, shows the thesis text plus its verdict
 * status (or "Checking against your thesis…" while the async job runs —
 * phase7.md task 4). Stocks with no thesis render exactly as before.
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
  const thesisStatusKey = diff.thesis ? (diff.thesis.verdict ?? "pending") : null;

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
      {diff.thesis && thesisStatusKey && (
        <div className="mt-3 rounded bg-gray-50 px-3 py-2 text-sm">
          <p className="text-gray-700">
            <span className="font-medium">Your thesis:</span> {diff.thesis.text}
          </p>
          <p className={`mt-1 text-xs ${THESIS_STATUS_COLOR[thesisStatusKey]}`}>
            Thesis status: {THESIS_STATUS_LABEL[thesisStatusKey]}
          </p>
        </div>
      )}
      {diff.explanation && diff.confidence && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-gray-500">Why is this flagged?</summary>
          <div className="pt-2">
            <WhyFlaggedDetail explanation={diff.explanation} confidence={diff.confidence} thesis={diff.thesis} />
          </div>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: will FAIL at this point — `WhyFlaggedDetail` doesn't accept a `thesis` prop yet. That's expected; Task 14 fixes it. Note the error and proceed.

- [ ] **Step 3: Commit**

```bash
git add components/digest/stock-card.tsx
git commit -m "feat: render thesis + verdict status on flagged stock cards"
```

---

### Task 14: Per-signal thesis reasoning in the evidence detail

**Files:**
- Modify: `components/digest/why-flagged-detail.tsx`

- [ ] **Step 1: Replace the file**

Full new content of `components/digest/why-flagged-detail.tsx`:

```typescript
import type { Confidence, Explanation } from "@/lib/scoring/score";
import type { ThesisField } from "@/lib/thesis/types";

/**
 * Full evidence trail for one flagged stock, labeled plainly — not raw
 * numbers dumped on screen (phase6.md task 3). This is the ONE place a
 * confidence label appears; the main digest stays free of it per spec.
 *
 * Phase 7: when `thesis` has a resolved analysis (signals present), adds a
 * "Thesis analysis" subsection with the per-article/signal reasoning behind
 * the verdict shown on the card (phase7.md task 4's "expand ... to include
 * the per-article/signal reasoning").
 */
export default function WhyFlaggedDetail({
  explanation,
  confidence,
  thesis,
}: {
  explanation: Explanation;
  confidence: Confidence;
  thesis?: ThesisField | null;
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
    <div className="space-y-3">
      <dl className="space-y-1.5 text-xs text-gray-600">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-3">
            <dt className="w-32 shrink-0 font-medium text-gray-500">{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {thesis && thesis.signals.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500">Thesis analysis</p>
          <ul className="mt-1 space-y-1.5 text-xs text-gray-600">
            {thesis.signals.map((s, i) => (
              <li key={i}>
                <span className="font-medium">{s.source}</span> ({s.assessment}) — {s.reasoning}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck`
Expected: exit 0 (resolves Task 13's expected failure).

Run: `npm run build`
Expected: compiles successfully, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add components/digest/why-flagged-detail.tsx
git commit -m "feat: show per-signal thesis reasoning in the evidence detail view"
```

---

### Task 15: Server action to edit a thesis

**Files:**
- Modify: `app/(protected)/watchlist/actions.ts`

- [ ] **Step 1: Add the action**

Append to `app/(protected)/watchlist/actions.ts` (after `markWatchlistSeen`):

```typescript

/**
 * Edit an existing watchlist item's thesis text (phase7.md task 5 — this UI
 * affordance never existed before Phase 7). User-scoped update, defense in
 * depth same as removeWatchlistItem. Does NOT touch change_events — past
 * verdicts stay historically accurate to whatever thesis text existed when
 * they were assessed; only a *future* change event will see the new text,
 * since the diffs route reads watchlist_items.thesis fresh on every call.
 */
export async function updateWatchlistThesis(
  id: string,
  thesis: string,
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, message: "You must be signed in." };
  if (!id) return { ok: false, message: "Nothing to update." };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("watchlist_items")
    .update({ thesis: thesis.trim() || null })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");

  if (error) {
    return { ok: false, message: "Couldn't update your thesis. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, message: "That item is no longer in your watchlist." };
  }

  revalidatePath("/watchlist");
  revalidatePath("/dashboard");
  return { ok: true, message: "Thesis updated." };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "app/(protected)/watchlist/actions.ts"
git commit -m "feat: updateWatchlistThesis server action"
```

---

### Task 16: Inline edit-thesis UI

**Files:**
- Create: `components/watchlist/edit-thesis.tsx`

- [ ] **Step 1: Write the file**

```typescript
"use client";

import { useState, useTransition } from "react";
import { updateWatchlistThesis } from "@/app/(protected)/watchlist/actions";

/**
 * Inline expand-to-edit for a watchlist item's thesis (phase7.md task 5).
 * Mirrors remove-stock-button.tsx's inline two-step interaction shape — a
 * small text control expands to a form, no modal chrome.
 */
export default function EditThesis({
  id,
  thesis,
}: {
  id: string;
  thesis: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(thesis ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(thesis ?? "");
          setError(null);
          setEditing(true);
        }}
        className="text-xs text-gray-400 hover:text-gray-700"
      >
        Edit thesis
      </button>
    );
  }

  return (
    <div className="mt-1 space-y-1.5">
      <textarea
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-gray-500"
      />
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await updateWatchlistThesis(id, value);
              if (res.ok) {
                setEditing(false);
              } else {
                setError(res.message ?? "Failed.");
              }
            })
          }
          className="rounded bg-gray-900 px-2 py-0.5 text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setEditing(false)}
          className="rounded border border-gray-300 px-2 py-0.5 text-gray-600"
        >
          Cancel
        </button>
        {error && <span className="text-red-600">{error}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/watchlist/edit-thesis.tsx
git commit -m "feat: inline edit-thesis UI"
```

---

### Task 17: Wire edit-thesis into the watchlist page

**Files:**
- Modify: `app/(protected)/watchlist/page.tsx`

- [ ] **Step 1: Add the import**

In `app/(protected)/watchlist/page.tsx`, add to the imports at the top:

```typescript
import EditThesis from "@/components/watchlist/edit-thesis";
```

- [ ] **Step 2: Replace the thesis paragraph with thesis text + the edit control**

Replace:

```typescript
                      {item.thesis && (
                        <p className="mt-1 text-sm text-gray-700">{item.thesis}</p>
                      )}
```

with:

```typescript
                      <div className="mt-1">
                        {item.thesis && (
                          <p className="text-sm text-gray-700">{item.thesis}</p>
                        )}
                        <EditThesis id={item.id} thesis={item.thesis} />
                      </div>
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: compiles successfully, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(protected)/watchlist/page.tsx"
git commit -m "feat: wire edit-thesis control into the watchlist page"
```

---

### Task 18: Docs + final full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Add a "Phase 7 — AI thesis relevance" section to `README.md` following the existing Phase 3/5/6 section pattern: what's built, the `GEMINI_API_KEY` env var, and a pointer to phase7.md's TESTING list as the acceptance criteria (mirrors how Phase 5/6 sections reference their own phase briefs). Add `GEMINI_API_KEY` to the env vars table if one exists.

- [ ] **Step 2: Run full verification suite**

Run: `npm run typecheck`
Expected: exit 0, no output.

Run: `npm run build`
Expected: compiles successfully, 0 errors, `/api/watchlist/diffs` still dynamic (ƒ).

Run: `npm run verify:thesis`
Expected: `All thesis checks passed.`

Run: `npm run verify:scoring`
Expected: all 13 checks still pass (regression — confirms Task 8's compute-for-diffs.ts change didn't break Phase 5 scoring).

Run: `npm run verify:digest`
Expected: all 16 checks still pass (regression).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: Phase 7 README section"
```

---

## Post-plan (not a task — the user's job per phase7.md)

phase7.md's 9-item TESTING list and 4 MANUAL STEPS need a real Clerk session, real `GEMINI_API_KEY`/`FINNHUB_API_KEY`, a flagged watchlist stock with a thesis, and Inngest-dashboard log inspection (to verify the de-dup/cap claims in tests 2 and 9) — none of this is doable headlessly, same as every prior phase.
