# Phase 3 — Market Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scheduled Inngest job stores live prices for every watchlisted symbol in `market_snapshots`, a daily job backfills `daily_history`, and `/watchlist` shows real price + % change instead of the placeholder.

**Architecture:** A source-agnostic adapter in `lib/market-data/` wraps `yahoo-finance2` (primary, all symbols) and Finnhub (secondary, US symbols only) behind `getQuote` / `getAllQuotes` / `getDailyHistory`. Two Inngest cron functions (`*/5 * * * *` snapshots, `30 1 * * *` history) read the distinct symbol set from `watchlist_items` with the service-role client, fetch through the adapter in throttled chunks of 5, and write shared reference rows. Per-symbol failures are collected and skipped, never fatal. A pure `classifyStaleness` function grades snapshot age (FRESH/DELAYED/STALE).

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (`@supabase/supabase-js`), Clerk, Inngest (`inngest` + `inngest-cli`), `yahoo-finance2`.

**Repo conventions to follow:**
- No automated test runner (Phases 1–2 had none). Verification = `npm run typecheck` + `npm run build` + standalone `node xxx.ts` scripts for pure logic (Node v24 strips types natively) + the manual checklist in Task 15.
- File headers are a block comment explaining *why* the file exists and any deliberate trade-off (see `lib/stocks/nse-fallback.ts`).
- Server-only modules start with `import "server-only";` (see `lib/supabase/admin.ts`).
- Symbols are normalized `.trim().toUpperCase()` everywhere (see `watchlist/actions.ts:32`).
- Commit after each task with a `feat:` / `chore:` / `docs:` prefix. End every commit message with:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

## File Structure

**Create:**

| Path | Responsibility |
| --- | --- |
| `lib/market-data/types.ts` | `Quote`, `DailyBar`, `MarketDataError`, `MarketDataSource`, `MarketDataErrorCode` |
| `lib/market-data/staleness.ts` | pure `classifyStaleness(fetchedAt, now?)` + `MarketSnapshotStatus` |
| `lib/market-data/sources/yahoo.ts` | `yahooSource: MarketDataSource` — wraps `yahoo-finance2` |
| `lib/market-data/sources/finnhub.ts` | `finnhubSource: MarketDataSource` — wraps Finnhub `/quote` REST |
| `lib/market-data/index.ts` | facade: `getQuote`, `getAllQuotes`, `getDailyHistory` |
| `lib/inngest/client.ts` | `export const inngest = new Inngest({ id: "smart-market-watchlist" })` |
| `lib/inngest/functions/snapshot-ingest.ts` | cron `*/5 * * * *` + `market/snapshot.requested` event → write `market_snapshots` |
| `lib/inngest/functions/daily-history-backfill.ts` | cron `30 1 * * *` + `market/history.requested` event → upsert `daily_history` |
| `lib/inngest/functions/shared.ts` | `loadWatchlistSymbols()`, `chunk()` — shared by both jobs |
| `app/api/inngest/route.ts` | `serve()` endpoint registering both functions |
| `app/api/dev/trigger/route.ts` | dev-only, auth-gated manual `inngest.send()` trigger |
| `components/watchlist/price-cell.tsx` | renders `₹price` + coloured `±%` or `Fetching price…` |
| `scratchpad/` scripts | throwaway verification (not committed) |

**Modify:**

| Path | Change |
| --- | --- |
| `package.json` | add deps `yahoo-finance2`, `inngest`; devDep `inngest-cli`; script `"inngest"` |
| `next.config.ts` | `serverExternalPackages: ["yahoo-finance2"]` |
| `.env.example` | note yahoo needs no key; add commented Inngest Cloud vars |
| `types/database.ts` | `export type MarketSnapshotStatus` |
| `app/(protected)/watchlist/page.tsx` | query snapshots + history, render `<PriceCell>` |
| `README.md` | Phase 3 section: run steps, acceptance tests, 5-min interval |
| `context.md` | Phase 3 status (Task 15) |

---

## Task 1: Dependencies + Inngest scaffold

**Files:**
- Modify: `package.json`
- Modify: `next.config.ts`
- Create: `lib/inngest/client.ts`
- Create: `app/api/inngest/route.ts`

- [ ] **Step 1: Install packages**

Run:
```bash
npm install yahoo-finance2 inngest
npm install --save-dev inngest-cli
```
Expected: `package.json` gains `yahoo-finance2` + `inngest` under `dependencies`, `inngest-cli` under `devDependencies`; exit 0.

- [ ] **Step 2: Add the `inngest` dev script**

In `package.json`, add to `"scripts"` (after `"typecheck"`):
```json
    "typecheck": "tsc --noEmit",
    "inngest": "inngest-cli@latest dev"
```

- [ ] **Step 3: Externalize `yahoo-finance2` from the server bundle**

Replace `next.config.ts` contents with:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // yahoo-finance2 ships its own CJS/ESM and does runtime schema validation;
  // let Next require it at runtime instead of bundling it.
  serverExternalPackages: ["yahoo-finance2"],
};

export default nextConfig;
```

- [ ] **Step 4: Create the Inngest client**

Create `lib/inngest/client.ts`:
```ts
import { Inngest } from "inngest";

/**
 * Single Inngest client for the app. `id` is the app slug the Inngest dev
 * server and Inngest Cloud use to group functions. No event/signing keys are
 * needed for local dev — `npx inngest-cli dev` discovers functions by polling
 * http://localhost:3000/api/inngest. For a Cloud deploy, set INNGEST_EVENT_KEY
 * and INNGEST_SIGNING_KEY (see .env.example) and they are picked up here
 * automatically from the environment.
 */
export const inngest = new Inngest({ id: "smart-market-watchlist" });
```

- [ ] **Step 5: Create the serve endpoint (no functions yet)**

Create `app/api/inngest/route.ts`:
```ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";

/**
 * Inngest's HTTP entrypoint. The dev server and Inngest Cloud call this route
 * server-to-server to sync the function list and invoke runs — it is NOT
 * Clerk-protected (see middleware.ts: /api/inngest is not in the protected
 * matcher). Functions are added to the array in later tasks.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [],
});
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 7: Verify the endpoint responds**

Run in one terminal: `npm run dev`
Then: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/inngest`
Expected: `200` (Inngest's introspection response). Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json next.config.ts lib/inngest/client.ts app/api/inngest/route.ts
git commit -m "$(cat <<'EOF'
chore: add yahoo-finance2 + inngest, scaffold inngest serve route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Adapter types

**Files:**
- Create: `lib/market-data/types.ts`

- [ ] **Step 1: Write the file**

Create `lib/market-data/types.ts`:
```ts
/**
 * Shared vocabulary for the market-data adapter layer.
 *
 * ISOLATION BOUNDARY: everything outside lib/market-data/ (Inngest jobs, the
 * watchlist page, later scoring code) imports ONLY from lib/market-data. No
 * business code imports `yahoo-finance2` or calls finnhub.io directly — swapping
 * or adding a data source must never touch a consumer.
 */

/** A single point-in-time price reading from one source. */
export interface Quote {
  /** Normalized upper-case symbol, e.g. "RELIANCE.NS" or "AAPL". */
  symbol: string;
  price: number;
  /** null when the source does not report volume (e.g. Finnhub free tier). */
  volume: number | null;
  /** Which underlying source answered: "yahoo" | "finnhub". */
  source: string;
  /** When this reading was taken (adapter call time, not exchange time). */
  fetchedAt: Date;
}

/** One trading day's close for the history backfill. */
export interface DailyBar {
  symbol: string;
  /** ISO calendar date, "YYYY-MM-DD". */
  date: string;
  close: number;
  volume: number | null;
}

export type MarketDataErrorCode =
  | "NOT_FOUND" // symbol unknown to the source / no price data
  | "TIMEOUT" // the source did not answer within the budget
  | "RATE_LIMIT" // the source refused us for volume reasons (HTTP 429)
  | "SOURCE_ERROR"; // anything else (bad response, parse failure, 5xx)

/** The only error type the adapter throws. Consumers switch on `.code`. */
export class MarketDataError extends Error {
  readonly code: MarketDataErrorCode;
  readonly symbol: string;
  readonly source: string;

  constructor(
    code: MarketDataErrorCode,
    symbol: string,
    source: string,
    message?: string,
  ) {
    super(message ?? `${source}: ${code} for ${symbol}`);
    this.name = "MarketDataError";
    this.code = code;
    this.symbol = symbol;
    this.source = source;
  }
}

/** Contract every concrete source (yahoo, finnhub, …) implements. */
export interface MarketDataSource {
  readonly name: string;
  /** True if this source can be expected to answer for `symbol`. */
  supports(symbol: string): boolean;
  /** Throws MarketDataError on any failure. */
  getQuote(symbol: string): Promise<Quote>;
  /** `days` calendar days back from today. Throws MarketDataError on failure. */
  getDailyHistory(symbol: string, days: number): Promise<DailyBar[]>;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/market-data/types.ts
git commit -m "$(cat <<'EOF'
feat: market-data adapter types

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Staleness classifier

**Files:**
- Create: `lib/market-data/staleness.ts`
- Verify: `scratchpad/verify-staleness.ts` (not committed)

- [ ] **Step 1: Write the failing verification script**

Create `C:\Users\vajee\AppData\Local\Temp\claude\c--Users-vajee-OneDrive-Desktop-Current-proj-code-by-groww\04d92092-4b70-45a4-9716-0bae92de3e3d\scratchpad\verify-staleness.ts`:
```ts
import { classifyStaleness } from "../../../../../../OneDrive/Desktop/Current proj/code,by groww/lib/market-data/staleness.ts";

const now = new Date("2026-09-04T12:00:00Z");
const cases: [string, string][] = [
  [new Date("2026-09-04T11:59:00Z").toISOString(), "FRESH"], // 1 min
  [new Date("2026-09-04T11:58:00Z").toISOString(), "DELAYED"], // 2 min
  [new Date("2026-09-04T11:52:00Z").toISOString(), "DELAYED"], // 8 min
  [new Date("2026-09-04T11:50:00Z").toISOString(), "DELAYED"], // 10 min exactly
  [new Date("2026-09-04T11:49:00Z").toISOString(), "STALE"], // 11 min
  [new Date("2026-09-04T11:40:00Z").toISOString(), "STALE"], // 20 min (spec test 7)
];

let failed = 0;
for (const [fetchedAt, expected] of cases) {
  const got = classifyStaleness(fetchedAt, now);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${fetchedAt} -> ${got} (want ${expected})`);
}
process.exit(failed === 0 ? 0 : 1);
```

> Note: adjust the relative `import` path if your repo root differs — simplest is to `cd` to the repo root and run `node --experimental-strip-types` against an absolute path. If the relative path is awkward, instead create the script at repo root as `scratchpad-verify-staleness.ts` importing `"./lib/market-data/staleness.ts"`, run it, then `rm` it.

- [ ] **Step 2: Run it — expect failure (module missing)**

Run (from repo root): `node scratchpad-verify-staleness.ts` (using the repo-root variant)
Expected: FAIL — `Cannot find module './lib/market-data/staleness.ts'`.

- [ ] **Step 3: Write the implementation**

Create `lib/market-data/staleness.ts`:
```ts
/**
 * Snapshot freshness grading. Pure, no I/O — safe to call from anywhere.
 *
 * Bands (from phase3.md, kept exactly):
 *   FRESH   age <  2 minutes
 *   DELAYED 2 minutes <= age <= 10 minutes
 *   STALE   age > 10 minutes
 *
 * The cron interval is 5 minutes, so in steady state the newest snapshot is
 * usually DELAYED (last fetch 3–5 min ago). That is honest, not a bug — nothing
 * surfaces this in the UI until Phase 8. This function is the source of truth;
 * the ingest job also writes a best-effort `status` onto rows so the column is
 * populated, but callers that need a correct value should recompute here.
 */

export type MarketSnapshotStatus = "FRESH" | "DELAYED" | "STALE";

const TWO_MIN_MS = 2 * 60 * 1000;
const TEN_MIN_MS = 10 * 60 * 1000;

export function classifyStaleness(
  fetchedAt: Date | string,
  now: Date = new Date(),
): MarketSnapshotStatus {
  const fetchedMs =
    typeof fetchedAt === "string" ? Date.parse(fetchedAt) : fetchedAt.getTime();
  const age = now.getTime() - fetchedMs;

  if (age < TWO_MIN_MS) return "FRESH";
  if (age <= TEN_MIN_MS) return "DELAYED";
  return "STALE";
}
```

- [ ] **Step 4: Run the verification script — expect pass**

Run (from repo root): `node scratchpad-verify-staleness.ts`
Expected: all 6 lines `PASS`, exit 0.

- [ ] **Step 5: Typecheck, then delete the scratch script**

Run: `npm run typecheck`
Expected: exit 0.
Then: `rm scratchpad-verify-staleness.ts`

- [ ] **Step 6: Commit**

```bash
git add lib/market-data/staleness.ts
git commit -m "$(cat <<'EOF'
feat: classifyStaleness snapshot freshness grader

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Yahoo Finance source

**Files:**
- Create: `lib/market-data/sources/yahoo.ts`

- [ ] **Step 1: Write the file**

Create `lib/market-data/sources/yahoo.ts`:
```ts
import "server-only";
import yahooFinance from "yahoo-finance2";
import { MarketDataError } from "@/lib/market-data/types";
import type { DailyBar, MarketDataSource, Quote } from "@/lib/market-data/types";

/**
 * Primary market-data source. yahoo-finance2 is an unofficial scraper of
 * Yahoo Finance's public JSON endpoints — no API key, no published quota. It
 * handles NSE tickers via the `.NS` suffix (RELIANCE.NS) and US tickers bare
 * (AAPL), so `supports()` is always true. It is the only history source in
 * Phase 3 (Finnhub candles are a paid endpoint).
 *
 * Trade-off: because it is unofficial it can break if Yahoo changes response
 * shapes. That is acceptable for a hackathon; the adapter isolates the blast
 * radius to this file.
 */

// Silence the first-run survey/notice banner in server logs.
yahooFinance.suppressNotices(["yahooSurvey"]);

const TIMEOUT_MS = 8000;

function withTimeout<T>(
  work: Promise<T>,
  symbol: string,
  source: string,
): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new MarketDataError("TIMEOUT", symbol, source)),
        TIMEOUT_MS,
      ),
    ),
  ]);
}

function toMarketDataError(
  err: unknown,
  symbol: string,
): MarketDataError {
  if (err instanceof MarketDataError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (/not found|404|no data|delisted/i.test(msg)) {
    return new MarketDataError("NOT_FOUND", symbol, "yahoo", msg);
  }
  return new MarketDataError("SOURCE_ERROR", symbol, "yahoo", msg);
}

export const yahooSource: MarketDataSource = {
  name: "yahoo",

  supports(): boolean {
    return true;
  },

  async getQuote(symbol: string): Promise<Quote> {
    try {
      const q = await withTimeout(
        yahooFinance.quote(symbol),
        symbol,
        "yahoo",
      );
      const price = q?.regularMarketPrice;
      if (typeof price !== "number" || !Number.isFinite(price)) {
        throw new MarketDataError("NOT_FOUND", symbol, "yahoo", "no price");
      }
      const volume =
        typeof q.regularMarketVolume === "number" ? q.regularMarketVolume : null;
      return {
        symbol: symbol.toUpperCase(),
        price,
        volume,
        source: "yahoo",
        fetchedAt: new Date(),
      };
    } catch (err) {
      throw toMarketDataError(err, symbol);
    }
  },

  async getDailyHistory(symbol: string, days: number): Promise<DailyBar[]> {
    const period1 = new Date();
    period1.setDate(period1.getDate() - days);
    try {
      const result = await withTimeout(
        yahooFinance.chart(symbol, { period1, interval: "1d" }),
        symbol,
        "yahoo",
      );
      const rows = (result?.quotes ?? [])
        .filter(
          (r): r is typeof r & { date: Date; close: number } =>
            r.date instanceof Date &&
            typeof r.close === "number" &&
            Number.isFinite(r.close),
        )
        .map((r) => ({
          symbol: symbol.toUpperCase(),
          date: r.date.toISOString().slice(0, 10),
          close: r.close,
          volume: typeof r.volume === "number" ? r.volume : null,
        }));
      if (rows.length === 0) {
        throw new MarketDataError("NOT_FOUND", symbol, "yahoo", "no history");
      }
      return rows;
    } catch (err) {
      throw toMarketDataError(err, symbol);
    }
  },
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. If `yahoo-finance2` types complain about the `chart` options or `quotes` shape, adjust the field guards but keep the `DailyBar[]` return contract identical.

- [ ] **Step 3: Live smoke test**

Create repo-root `scratchpad-verify-yahoo.ts`:
```ts
import { yahooSource } from "./lib/market-data/sources/yahoo.ts";

const q = await yahooSource.getQuote("RELIANCE.NS");
console.log("quote:", q);
if (q.price <= 0) throw new Error("bad price");

const hist = await yahooSource.getDailyHistory("RELIANCE.NS", 30);
console.log("history rows:", hist.length, "first:", hist[0], "last:", hist.at(-1));
if (hist.length < 5) throw new Error("expected multiple days");

try {
  await yahooSource.getQuote("NONSENSE.NS");
  throw new Error("should have thrown");
} catch (e) {
  console.log("bad symbol ->", (e as Error).name, (e as { code?: string }).code);
}
```

Run: `node scratchpad-verify-yahoo.ts`
Expected: a quote object with a positive `price`; `history rows:` ≥ 20; `bad symbol -> MarketDataError NOT_FOUND` (code may be `SOURCE_ERROR` depending on Yahoo's response — acceptable as long as it is a `MarketDataError`).
Then: `rm scratchpad-verify-yahoo.ts`

- [ ] **Step 4: Commit**

```bash
git add lib/market-data/sources/yahoo.ts
git commit -m "$(cat <<'EOF'
feat: yahoo-finance2 market-data source (quotes + daily history)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Finnhub source

**Files:**
- Create: `lib/market-data/sources/finnhub.ts`

- [ ] **Step 1: Write the file**

Create `lib/market-data/sources/finnhub.ts`:
```ts
import "server-only";
import { MarketDataError } from "@/lib/market-data/types";
import type { DailyBar, MarketDataSource, Quote } from "@/lib/market-data/types";

/**
 * Secondary market-data source. Reuses the FINNHUB_API_KEY already configured
 * in Phase 2 for search. Two jobs here:
 *   1. Quote US-listed symbols if any get added (yahoo still also covers them).
 *   2. Be a genuine second opinion for symbols both sources support, so the
 *      cross-source conflict logic in Phase 5+ has real disagreeing data to
 *      work with — not faked conflicts.
 *
 * Finnhub's free tier does NOT quote Indian equities and its daily-candle
 * endpoint (/stock/candle) is paid. So `supports()` is US-only (no .NS/.BO
 * suffix) and `getDailyHistory` always declines — yahoo is the history source.
 */

const QUOTE_URL = "https://finnhub.io/api/v1/quote";
const TIMEOUT_MS = 6000;

function hasIndianSuffix(symbol: string): boolean {
  return /\.(NS|BO)$/i.test(symbol);
}

interface FinnhubQuote {
  c: number; // current price
  v?: number; // volume (often absent on free tier)
  t: number; // unix seconds
}

export const finnhubSource: MarketDataSource = {
  name: "finnhub",

  supports(symbol: string): boolean {
    return Boolean(process.env.FINNHUB_API_KEY) && !hasIndianSuffix(symbol);
  },

  async getQuote(symbol: string): Promise<Quote> {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      throw new MarketDataError("SOURCE_ERROR", symbol, "finnhub", "no api key");
    }

    let res: Response;
    try {
      res = await fetch(
        `${QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
        { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" },
      );
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      throw new MarketDataError(
        timedOut ? "TIMEOUT" : "SOURCE_ERROR",
        symbol,
        "finnhub",
        err instanceof Error ? err.message : undefined,
      );
    }

    if (res.status === 429) {
      throw new MarketDataError("RATE_LIMIT", symbol, "finnhub");
    }
    if (!res.ok) {
      throw new MarketDataError(
        "SOURCE_ERROR",
        symbol,
        "finnhub",
        `HTTP ${res.status}`,
      );
    }

    const data = (await res.json()) as FinnhubQuote;
    if (typeof data.c !== "number" || data.c === 0) {
      // Finnhub returns c:0 for unknown symbols.
      throw new MarketDataError("NOT_FOUND", symbol, "finnhub");
    }

    return {
      symbol: symbol.toUpperCase(),
      price: data.c,
      volume: typeof data.v === "number" ? data.v : null,
      source: "finnhub",
      fetchedAt: new Date(),
    };
  },

  async getDailyHistory(symbol: string): Promise<DailyBar[]> {
    // Paid endpoint on the free tier — declined by design.
    throw new MarketDataError(
      "SOURCE_ERROR",
      symbol,
      "finnhub",
      "daily history not available on the Finnhub free tier",
    );
  },
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/market-data/sources/finnhub.ts
git commit -m "$(cat <<'EOF'
feat: finnhub secondary market-data source (US quotes only)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Adapter facade

**Files:**
- Create: `lib/market-data/index.ts`

- [ ] **Step 1: Write the file**

Create `lib/market-data/index.ts`:
```ts
import "server-only";
import { MarketDataError } from "@/lib/market-data/types";
import type { DailyBar, MarketDataSource, Quote } from "@/lib/market-data/types";
import { yahooSource } from "@/lib/market-data/sources/yahoo";
import { finnhubSource } from "@/lib/market-data/sources/finnhub";

/**
 * Public market-data facade. This is the ONLY module the rest of the app
 * imports for prices/history.
 *
 * Priority order: yahoo first (covers every symbol, no quota), finnhub second
 * (US symbols only, second opinion). `getQuote` returns the single best answer;
 * `getAllQuotes` returns every source that answered so US symbols accumulate a
 * genuine cross-source pair in market_snapshots.
 */

export type { Quote, DailyBar } from "@/lib/market-data/types";
export { MarketDataError } from "@/lib/market-data/types";
export type { MarketDataErrorCode } from "@/lib/market-data/types";

const SOURCES: MarketDataSource[] = [yahooSource, finnhubSource];

/** Best single quote for `symbol`. Throws MarketDataError if every source fails. */
export async function getQuote(symbol: string): Promise<Quote> {
  const usable = SOURCES.filter((s) => s.supports(symbol));
  let lastError: MarketDataError = new MarketDataError(
    "SOURCE_ERROR",
    symbol,
    "none",
    "no source supports this symbol",
  );
  for (const source of usable) {
    try {
      return await source.getQuote(symbol);
    } catch (err) {
      lastError =
        err instanceof MarketDataError
          ? err
          : new MarketDataError("SOURCE_ERROR", symbol, source.name);
    }
  }
  throw lastError;
}

/**
 * Every quote we can get for `symbol`, one per source that answered. Order
 * follows SOURCES (yahoo first). Throws only if NO source answered; partial
 * success returns the successes and console.warn-logs the failures.
 */
export async function getAllQuotes(symbol: string): Promise<Quote[]> {
  const usable = SOURCES.filter((s) => s.supports(symbol));
  const settled = await Promise.allSettled(
    usable.map((s) => s.getQuote(symbol)),
  );

  const quotes: Quote[] = [];
  const errors: MarketDataError[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      quotes.push(r.value);
    } else {
      const e =
        r.reason instanceof MarketDataError
          ? r.reason
          : new MarketDataError("SOURCE_ERROR", symbol, usable[i].name);
      errors.push(e);
      console.warn(
        `[market-data] ${usable[i].name} failed for ${symbol}: ${e.code}`,
      );
    }
  });

  if (quotes.length === 0) {
    throw errors[0] ?? new MarketDataError("NOT_FOUND", symbol, "none");
  }
  return quotes;
}

/** Daily closes for `symbol`, newest source that supports history. yahoo-only for now. */
export async function getDailyHistory(
  symbol: string,
  days: number,
): Promise<DailyBar[]> {
  let lastError: MarketDataError = new MarketDataError(
    "SOURCE_ERROR",
    symbol,
    "none",
  );
  for (const source of SOURCES) {
    if (!source.supports(symbol)) continue;
    try {
      return await source.getDailyHistory(symbol, days);
    } catch (err) {
      lastError =
        err instanceof MarketDataError
          ? err
          : new MarketDataError("SOURCE_ERROR", symbol, source.name);
    }
  }
  throw lastError;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Live smoke test**

Create repo-root `scratchpad-verify-adapter.ts`:
```ts
import { getQuote, getAllQuotes, getDailyHistory } from "./lib/market-data/index.ts";

console.log("NS getQuote:", await getQuote("TCS.NS"));
console.log("NS getAllQuotes count:", (await getAllQuotes("TCS.NS")).length); // 1 (yahoo)
const us = await getAllQuotes("AAPL");
console.log("US getAllQuotes sources:", us.map((q) => q.source)); // ["yahoo","finnhub"] if key valid
console.log("history rows:", (await getDailyHistory("TCS.NS", 30)).length);
```

Run: `node scratchpad-verify-adapter.ts`
Expected: NS `getAllQuotes count: 1`; US sources include `"yahoo"` and (if the Finnhub key is live) `"finnhub"`; history rows ≥ 20.
Then: `rm scratchpad-verify-adapter.ts`

- [ ] **Step 4: Commit**

```bash
git add lib/market-data/index.ts
git commit -m "$(cat <<'EOF'
feat: market-data facade (getQuote / getAllQuotes / getDailyHistory)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Export `MarketSnapshotStatus` from database types

**Files:**
- Modify: `types/database.ts`

- [ ] **Step 1: Add the type**

At the end of `types/database.ts`, after the closing `}` of `interface Database`, add:
```ts

/**
 * Allowed values for `market_snapshots.status`. The column is free `text` with a
 * `'FRESH'` default (Phase 1 schema) — this union is the app-level contract.
 * Kept in sync with lib/market-data/staleness.ts:MarketSnapshotStatus.
 */
export type MarketSnapshotStatus = "FRESH" | "DELAYED" | "STALE";
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add types/database.ts
git commit -m "$(cat <<'EOF'
feat: MarketSnapshotStatus union in database types

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Shared job helpers

**Files:**
- Create: `lib/inngest/functions/shared.ts`

- [ ] **Step 1: Write the file**

Create `lib/inngest/functions/shared.ts`:
```ts
import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Helpers shared by both Inngest jobs. Symbol loading uses the SERVICE-ROLE
 * client on purpose: the watchlisted symbol set is shared reference data the
 * jobs need across all users, not something scoped to one Clerk session, and
 * the jobs run with no user context at all.
 */

/** Distinct, trimmed, upper-cased symbols across every user's watchlist. */
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

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Verify `chunk` logic**

Create repo-root `scratchpad-verify-chunk.ts`:
```ts
import { chunk } from "./lib/inngest/functions/shared.ts";
const r = chunk([1, 2, 3, 4, 5, 6, 7], 5);
console.log(JSON.stringify(r));
if (r.length !== 2 || r[0].length !== 5 || r[1].length !== 2) throw new Error("FAIL");
console.log("PASS");
```

> `shared.ts` imports `server-only`, which throws outside Next. For this check, temporarily comment the `import "server-only";` line, run the script, then restore it. Alternatively skip this step — `chunk` is trivial and covered by the manual job tests.

Run: `node scratchpad-verify-chunk.ts` → `PASS`. Restore the import. `rm scratchpad-verify-chunk.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/inngest/functions/shared.ts
git commit -m "$(cat <<'EOF'
feat: shared inngest job helpers (symbol load, chunk)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Snapshot ingest job

**Files:**
- Create: `lib/inngest/functions/snapshot-ingest.ts`

- [ ] **Step 1: Write the file**

Create `lib/inngest/functions/snapshot-ingest.ts`:
```ts
import { inngest } from "@/lib/inngest/client";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getAllQuotes, MarketDataError } from "@/lib/market-data";
import { classifyStaleness } from "@/lib/market-data/staleness";
import { chunk, loadWatchlistSymbols } from "@/lib/inngest/functions/shared";

/**
 * Snapshot ingest. Runs every 5 minutes (and on the market/snapshot.requested
 * event, which the dev trigger route and the Inngest dashboard fire).
 *
 * For each distinct watchlisted symbol it writes one market_snapshots row per
 * source that answered (US symbols -> yahoo + finnhub, NSE -> yahoo only). A
 * single symbol failing (bad ticker, timeout, rate limit) is logged into the
 * `failures` array and skipped — it never aborts the batch. Symbols are
 * processed in chunks of 5 with a 1s gap so we don't hammer either source.
 *
 * Polling interval: 5 minutes (see docs/superpowers/specs). Staleness bands in
 * lib/market-data/staleness.ts assume this cadence.
 */

const CHUNK_SIZE = 5;

interface InsertRow {
  symbol: string;
  price: number;
  volume: number | null;
  source: string;
  status: "FRESH";
  fetched_at: string;
}

interface Failure {
  symbol: string;
  source: string;
  code: string;
}

export const snapshotIngest = inngest.createFunction(
  { id: "snapshot-ingest", name: "Market snapshot ingest" },
  [{ cron: "*/5 * * * *" }, { event: "market/snapshot.requested" }],
  async ({ step }) => {
    const symbols = await step.run("load-symbols", loadWatchlistSymbols);

    if (symbols.length === 0) {
      return { processed: 0, inserted: 0, failures: [] as Failure[] };
    }

    const chunks = chunk(symbols, CHUNK_SIZE);
    const allRows: InsertRow[] = [];
    const allFailures: Failure[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const { rows, failures } = await step.run(
        `fetch-chunk-${i}`,
        async () => {
          const rowsOut: InsertRow[] = [];
          const failOut: Failure[] = [];
          const nowIso = new Date().toISOString();

          await Promise.all(
            chunks[i].map(async (symbol) => {
              try {
                const quotes = await getAllQuotes(symbol);
                for (const q of quotes) {
                  rowsOut.push({
                    symbol: q.symbol,
                    price: q.price,
                    volume: q.volume,
                    source: q.source,
                    status: "FRESH",
                    fetched_at: nowIso,
                  });
                }
              } catch (err) {
                const e =
                  err instanceof MarketDataError
                    ? err
                    : new MarketDataError("SOURCE_ERROR", symbol, "unknown");
                failOut.push({ symbol, source: e.source, code: e.code });
                console.error(
                  `[snapshot-ingest] skipped ${symbol}: ${e.code} (${e.source})`,
                );
              }
            }),
          );

          return { rows: rowsOut, failures: failOut };
        },
      );

      allRows.push(...rows);
      allFailures.push(...failures);

      if (i < chunks.length - 1) {
        await step.sleep(`gap-${i}`, "1s");
      }
    }

    // Decay the PREVIOUS newest snapshot per symbol before inserting the new
    // ones, so the stored `status` reflects how old that row actually got.
    const decayed = await step.run("decay-existing", async () => {
      const supabase = createAdminSupabaseClient();
      const { data, error } = await supabase
        .from("market_snapshots")
        .select("id, symbol, fetched_at, status")
        .in("symbol", symbols)
        .order("fetched_at", { ascending: false });

      if (error || !data) return 0;

      const seen = new Set<string>();
      const now = new Date();
      let updates = 0;
      for (const row of data) {
        if (seen.has(row.symbol)) continue;
        seen.add(row.symbol);
        const fresh = classifyStaleness(row.fetched_at, now);
        if (fresh !== row.status) {
          await supabase
            .from("market_snapshots")
            .update({ status: fresh })
            .eq("id", row.id);
          updates++;
        }
      }
      return updates;
    });

    const inserted = await step.run("insert-snapshots", async () => {
      if (allRows.length === 0) return 0;
      const supabase = createAdminSupabaseClient();
      const { error } = await supabase.from("market_snapshots").insert(allRows);
      if (error) throw new Error(`insert market_snapshots: ${error.message}`);
      return allRows.length;
    });

    return {
      processed: symbols.length,
      inserted,
      decayed,
      failures: allFailures,
    };
  },
);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. If Inngest's `createFunction` overload rejects the two-trigger array, split into `[{ cron: "*/5 * * * *" }, { event: "market/snapshot.requested" }]` exactly as written — this is the supported multi-trigger form in `inngest` v3. If still failing, check the installed major with `npm ls inngest` and adapt to that version's trigger signature, keeping both a cron and an event trigger.

- [ ] **Step 3: Commit**

```bash
git add lib/inngest/functions/snapshot-ingest.ts
git commit -m "$(cat <<'EOF'
feat: snapshot-ingest inngest job (5-min cron, partial-failure safe)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Daily history backfill job

**Files:**
- Create: `lib/inngest/functions/daily-history-backfill.ts`

- [ ] **Step 1: Write the file**

Create `lib/inngest/functions/daily-history-backfill.ts`:
```ts
import { inngest } from "@/lib/inngest/client";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getDailyHistory, MarketDataError } from "@/lib/market-data";
import { chunk, loadWatchlistSymbols } from "@/lib/inngest/functions/shared";

/**
 * Daily history backfill. Runs once a day at 01:30 UTC (and on the
 * market/history.requested event). Fetches ~45 calendar days of daily closes
 * per watchlisted symbol and upserts them into daily_history — Phase 5's
 * volatility and sector-benchmark math reads from that table, so it needs real
 * multi-day data now.
 *
 * Same partial-failure contract as snapshot-ingest: one symbol failing is
 * logged and skipped, never fatal. yahoo is the only history source (Finnhub
 * candles are paid).
 */

const CHUNK_SIZE = 5;
const HISTORY_DAYS = 45;

interface HistoryRow {
  symbol: string;
  date: string;
  close: number;
  volume: number | null;
}

interface Failure {
  symbol: string;
  code: string;
}

export const dailyHistoryBackfill = inngest.createFunction(
  { id: "daily-history-backfill", name: "Daily history backfill" },
  [{ cron: "30 1 * * *" }, { event: "market/history.requested" }],
  async ({ step }) => {
    const symbols = await step.run("load-symbols", loadWatchlistSymbols);

    if (symbols.length === 0) {
      return { processed: 0, rowsUpserted: 0, failures: [] as Failure[] };
    }

    const chunks = chunk(symbols, CHUNK_SIZE);
    const allRows: HistoryRow[] = [];
    const allFailures: Failure[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const { rows, failures } = await step.run(
        `fetch-chunk-${i}`,
        async () => {
          const rowsOut: HistoryRow[] = [];
          const failOut: Failure[] = [];

          await Promise.all(
            chunks[i].map(async (symbol) => {
              try {
                const bars = await getDailyHistory(symbol, HISTORY_DAYS);
                for (const b of bars) {
                  rowsOut.push({
                    symbol: b.symbol,
                    date: b.date,
                    close: b.close,
                    volume: b.volume,
                  });
                }
              } catch (err) {
                const e =
                  err instanceof MarketDataError
                    ? err
                    : new MarketDataError("SOURCE_ERROR", symbol, "unknown");
                failOut.push({ symbol, code: e.code });
                console.error(
                  `[daily-history-backfill] skipped ${symbol}: ${e.code}`,
                );
              }
            }),
          );

          return { rows: rowsOut, failures: failOut };
        },
      );

      allRows.push(...rows);
      allFailures.push(...failures);

      if (i < chunks.length - 1) {
        await step.sleep(`gap-${i}`, "1s");
      }
    }

    const rowsUpserted = await step.run("upsert-history", async () => {
      if (allRows.length === 0) return 0;
      const supabase = createAdminSupabaseClient();
      const { error } = await supabase
        .from("daily_history")
        .upsert(allRows, { onConflict: "symbol,date" });
      if (error) throw new Error(`upsert daily_history: ${error.message}`);
      return allRows.length;
    });

    return { processed: symbols.length, rowsUpserted, failures: allFailures };
  },
);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/inngest/functions/daily-history-backfill.ts
git commit -m "$(cat <<'EOF'
feat: daily-history-backfill inngest job (daily cron, upsert)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Register functions in the serve route

**Files:**
- Modify: `app/api/inngest/route.ts`

- [ ] **Step 1: Update the route**

Replace `app/api/inngest/route.ts` contents with:
```ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { snapshotIngest } from "@/lib/inngest/functions/snapshot-ingest";
import { dailyHistoryBackfill } from "@/lib/inngest/functions/daily-history-backfill";

/**
 * Inngest's HTTP entrypoint. The dev server (`npm run inngest`) and Inngest
 * Cloud call this route server-to-server to sync functions and invoke runs.
 * It is NOT Clerk-protected — see middleware.ts (not in the protected matcher).
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [snapshotIngest, dailyHistoryBackfill],
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Verify functions register with the dev server**

Terminal 1: `npm run dev`
Terminal 2: `npm run inngest` (runs `inngest-cli@latest dev`)
Open `http://localhost:8288` → **Functions** tab.
Expected: `snapshot-ingest` and `daily-history-backfill` both listed, each showing a cron trigger. Stop both.

- [ ] **Step 4: Commit**

```bash
git add app/api/inngest/route.ts
git commit -m "$(cat <<'EOF'
feat: register snapshot + history jobs on the inngest serve route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Dev-only manual trigger route

**Files:**
- Create: `app/api/dev/trigger/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/dev/trigger/route.ts`:
```ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { inngest } from "@/lib/inngest/client";

/**
 * Dev-only manual trigger so you don't have to wait for the 5-minute cron while
 * testing. 404s in production. Auth-gated (Clerk) so a stray request can't
 * spend our data-source quota.
 *
 *   GET/POST /api/dev/trigger?job=snapshot   -> fires market/snapshot.requested
 *   GET/POST /api/dev/trigger?job=history    -> fires market/history.requested
 *
 * The Inngest dev dashboard's "Invoke" button is the other way to do this.
 */

const EVENTS = {
  snapshot: "market/snapshot.requested",
  history: "market/history.requested",
} as const;

async function handle(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobParam = new URL(request.url).searchParams.get("job") ?? "snapshot";
  if (jobParam !== "snapshot" && jobParam !== "history") {
    return NextResponse.json(
      { error: "job must be 'snapshot' or 'history'" },
      { status: 400 },
    );
  }

  const { ids } = await inngest.send({ name: EVENTS[jobParam] });
  return NextResponse.json({ sent: true, job: jobParam, ids });
}

export const GET = handle;
export const POST = handle;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/api/dev/trigger/route.ts
git commit -m "$(cat <<'EOF'
feat: dev-only auth-gated manual trigger for the market jobs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: PriceCell component

**Files:**
- Create: `components/watchlist/price-cell.tsx`
- Verify: repo-root `scratchpad-verify-pct.ts` (not committed)

- [ ] **Step 1: Write the component**

Create `components/watchlist/price-cell.tsx`:
```tsx
/**
 * Renders a watchlist row's price. Server component, no client JS.
 *
 *   - price + prevClose present -> "₹1,250.40" and a coloured "+1.24%"
 *   - price present, no usable prevClose -> just the price
 *   - no price -> muted "Fetching price…" (symbol added but the job hasn't run)
 *
 * Staleness is intentionally NOT shown here — that badge is Phase 8.
 */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function percentChange(
  price: number,
  prevClose: number | null | undefined,
): number | null {
  if (typeof prevClose !== "number" || !Number.isFinite(prevClose) || prevClose === 0) {
    return null;
  }
  return ((price - prevClose) / prevClose) * 100;
}

export default function PriceCell({
  price,
  prevClose,
}: {
  price: number | null | undefined;
  prevClose: number | null | undefined;
}) {
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return (
      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
        Fetching price…
      </span>
    );
  }

  const pct = percentChange(price, prevClose);
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
      ? null
      : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%`;

  return (
    <div className="text-right">
      <div className="font-medium tabular-nums">{inr.format(price)}</div>
      {pctLabel && (
        <div className={`text-xs tabular-nums ${pctColor}`}>{pctLabel}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify `percentChange`**

Create repo-root `scratchpad-verify-pct.ts`:
```ts
import { percentChange } from "./components/watchlist/price-cell.tsx";

const rows: [number, number | null, number | null][] = [
  [110, 100, 10],
  [95, 100, -5],
  [100, 100, 0],
  [100, 0, null],
  [100, null, null],
];
let bad = 0;
for (const [p, pc, want] of rows) {
  const got = percentChange(p, pc);
  const ok = want === null ? got === null : Math.abs((got as number) - want) < 1e-9;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"} pct(${p}, ${pc}) = ${got} (want ${want})`);
}
process.exit(bad === 0 ? 0 : 1);
```

Run: `node scratchpad-verify-pct.ts`
Expected: 5× `PASS`, exit 0. Then `rm scratchpad-verify-pct.ts`.

> If Node balks at JSX in the imported `.tsx`, move `percentChange` into a plain `components/watchlist/price-cell.helpers.ts` file, import it from the component, and point the script there instead.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add components/watchlist/price-cell.tsx
git commit -m "$(cat <<'EOF'
feat: PriceCell — price + % change with fetching-price fallback

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Wire real prices into `/watchlist`

**Files:**
- Modify: `app/(protected)/watchlist/page.tsx`

- [ ] **Step 1: Replace the page**

Replace `app/(protected)/watchlist/page.tsx` contents with:
```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import AddStock from "@/components/watchlist/add-stock";
import RemoveStockButton from "@/components/watchlist/remove-stock-button";
import PriceCell from "@/components/watchlist/price-cell";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Newest snapshot per symbol; on an equal timestamp, prefer the yahoo row. */
function latestSnapshotBySymbol(
  rows: { symbol: string; price: number; source: string; fetched_at: string }[],
) {
  const map = new Map<string, { price: number; source: string; fetched_at: string }>();
  for (const r of rows) {
    const cur = map.get(r.symbol);
    if (
      !cur ||
      r.fetched_at > cur.fetched_at ||
      (r.fetched_at === cur.fetched_at && r.source === "yahoo")
    ) {
      map.set(r.symbol, { price: r.price, source: r.source, fetched_at: r.fetched_at });
    }
  }
  return map;
}

/** Newest daily_history close per symbol -> "previous close" reference. */
function latestCloseBySymbol(rows: { symbol: string; date: string; close: number }[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const cur = map.get(r.symbol);
    if (cur === undefined) map.set(r.symbol, r.close);
    // rows arrive date-desc, so the first per symbol is newest
  }
  return map;
}

export default async function WatchlistPage() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("watchlist_items")
    .select("id, symbol, company_name, thesis, added_at")
    .order("added_at", { ascending: false });

  const items = data ?? [];
  const symbols = [...new Set(items.map((i) => i.symbol))];

  // market_snapshots + daily_history are shared reference tables with a
  // `select ... using (true)` RLS policy (Phase 1) — a signed-in user can read
  // them through the RLS-scoped client.
  let priceBySymbol = new Map<
    string,
    { price: number; source: string; fetched_at: string }
  >();
  let prevCloseBySymbol = new Map<string, number>();

  if (symbols.length > 0) {
    const [{ data: snaps }, { data: hist }] = await Promise.all([
      supabase
        .from("market_snapshots")
        .select("symbol, price, source, fetched_at")
        .in("symbol", symbols)
        .order("fetched_at", { ascending: false }),
      supabase
        .from("daily_history")
        .select("symbol, date, close")
        .in("symbol", symbols)
        .order("date", { ascending: false }),
    ]);

    priceBySymbol = latestSnapshotBySymbol(snaps ?? []);
    prevCloseBySymbol = latestCloseBySymbol(hist ?? []);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Your watchlist</h1>
        <p className="text-sm text-gray-600">
          Search a stock, add it with an optional thesis, and it stays here —
          synced to your account.
        </p>
      </div>

      <AddStock />

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn&apos;t load your watchlist. Refresh to try again.
        </p>
      )}

      {!error && items.length === 0 && (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm font-medium text-gray-700">
            Nothing on your watchlist yet
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Use the search box above to add your first stock.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200">
          {items.map((item) => {
            const snap = priceBySymbol.get(item.symbol);
            return (
              <li key={item.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{item.symbol}</span>
                      {item.company_name && (
                        <span className="truncate text-sm text-gray-500">
                          {item.company_name}
                        </span>
                      )}
                    </div>
                    {item.thesis && (
                      <p className="mt-1 text-sm text-gray-700">{item.thesis}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">
                      Added {formatDate(item.added_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <PriceCell
                      price={snap?.price}
                      prevClose={prevCloseBySymbol.get(item.symbol)}
                    />
                    <RemoveStockButton id={item.id} symbol={item.symbol} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: compiles, 0 errors, route list now includes `/api/inngest` and `/api/dev/trigger`.

- [ ] **Step 4: Commit**

```bash
git add "app/(protected)/watchlist/page.tsx"
git commit -m "$(cat <<'EOF'
feat: show live snapshot price + % change on the watchlist page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Config, docs, middleware check, manual verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `middleware.ts` (only if the check in Step 2 shows a problem)
- Modify: `context.md`

- [ ] **Step 1: Update `.env.example`**

Append to `.env.example`:
```bash

# ---- Market data (Phase 3) ----
# Primary source is `yahoo-finance2` — an npm package, no API key, no signup.
# Finnhub (FINNHUB_API_KEY above) is reused as a secondary source for US symbols.

# ---- Inngest (Phase 3 — scheduled jobs) ----
# Local dev needs NO keys: run `npm run inngest` (inngest-cli dev) next to
# `npm run dev`. The vars below are only for an Inngest Cloud deploy.
# INNGEST_EVENT_KEY=
# INNGEST_SIGNING_KEY=
```

- [ ] **Step 2: Confirm `/api/inngest` is not Clerk-protected**

Run: `npm run dev` in one terminal, then:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/inngest
```
Expected: `200`. If it is `401`/`404` with an `x-clerk-auth-reason` header, edit `middleware.ts` — add an `isPublicApi = createRouteMatcher(["/api/inngest(.*)"])` guard and `if (isPublicApi(req)) return;` at the top of the `clerkMiddleware` callback. Re-run the curl to confirm `200`. Stop the dev server. Commit `middleware.ts` only if changed.

- [ ] **Step 3: Add the README Phase 3 section**

In `README.md`:

a. Update the intro line `**Phases 1–2 complete**` → `**Phases 1–3 complete**` and add `· Inngest (scheduled market-data jobs) · yahoo-finance2 (prices)` to the Stack line.

b. In the **Scripts** table add:
```
| `npm run inngest`   | Inngest dev server (run alongside `npm run dev`) |
```

c. In the **Routes** table add:
```
| `/api/inngest`| internal      | Inngest sync/invoke endpoint (not user-facing)     |
| `/api/dev/trigger` | authenticated, dev-only | Manually fire `?job=snapshot` or `?job=history` |
```

d. Add this section immediately above `## Phase 2 acceptance tests`:
```markdown
## Phase 3: market data

Two Inngest jobs keep prices flowing:

- **snapshot-ingest** — cron `*/5 * * * *`. Writes a `market_snapshots` row per
  source (yahoo for all symbols, Finnhub also for US symbols) for every distinct
  symbol in any user's watchlist. Per-symbol failures are logged and skipped.
- **daily-history-backfill** — cron `30 1 * * *`. Upserts ~45 days of daily
  closes per symbol into `daily_history` (Phase 5 volatility/benchmark input).

**Chosen polling interval: 5 minutes.** Staleness bands
(`lib/market-data/staleness.ts`): FRESH <2 min, DELAYED 2–10 min, STALE >10 min.
In steady state the watchlist price reads as DELAYED — that is honest (last
fetch 3–5 min ago), and nothing surfaces the badge until Phase 8.

### Running the jobs in dev

```bash
npm run dev        # terminal 1
npm run inngest    # terminal 2 — inngest-cli dev, dashboard on :8288
```

Trigger on demand without waiting for the cron:
`curl -X POST "http://localhost:3000/api/dev/trigger?job=snapshot"` (must be
signed in — do it from the browser, or copy a session cookie), or use the
**Invoke** button in the Inngest dashboard at http://localhost:8288.

No new SQL migration — `market_snapshots` and `daily_history` were created in
Phase 1's `0001_init.sql`.

## Phase 3 acceptance tests

1. Trigger `?job=snapshot` → new `market_snapshots` rows for every symbol in any
   watchlist.
2. Add a new stock (Phase 2 flow) → trigger again → a snapshot appears for it
   too (proves the job reads `watchlist_items` live, not a hardcoded list).
3. Put a nonsense symbol on a watchlist directly in Supabase → trigger → it is
   logged/skipped in the run output's `failures`, every other symbol still
   processed.
4. Trigger `?job=history` → `daily_history` has multiple dated rows per symbol.
5. Reload `/watchlist` → real price + % change for symbols that have snapshots.
6. Add a brand-new stock, open `/watchlist` before the job runs → clean
   "Fetching price…", no crash, no fake ₹0.
7. Insert a `market_snapshots` row with `fetched_at` 20 minutes ago →
   `classifyStaleness` returns `STALE` for it.
8. Restart `npm run dev` + `npm run inngest` clean → both functions show in the
   dashboard and the cron fires on its own.
```

- [ ] **Step 4: Run the full manual acceptance checklist**

With `npm run dev` + `npm run inngest` both running and at least 3 symbols on a
test watchlist (mix of `.NS` and one US like `AAPL`):

1. **Test 1** — `http://localhost:8288` → Invoke `snapshot-ingest` (or `curl -X POST .../api/dev/trigger?job=snapshot` from the browser). In Supabase, `select * from market_snapshots order by fetched_at desc` → one row per `.NS` symbol, two rows (yahoo + finnhub) for `AAPL`, all `status = 'FRESH'`.
2. **Test 2** — add `INFY.NS` via the watchlist UI → Invoke again → a new `INFY.NS` snapshot exists.
3. **Test 3** — in Supabase `insert into watchlist_items (symbol) values ('ZZ_FAKE.NS')` under a real `user_id` → Invoke → run output shows `failures: [{ symbol: "ZZ_FAKE.NS", ... }]`, and every real symbol still got a fresh snapshot. Delete the fake row after.
4. **Test 4** — Invoke `daily-history-backfill` → `select symbol, count(*) from daily_history group by symbol` → each real symbol has ≥ 20 rows.
5. **Test 5** — reload `/watchlist` → `.NS` symbols show `₹…` and a coloured `±%`.
6. **Test 6** — add `WIPRO.NS`, immediately reload `/watchlist` (before the next Invoke) → its row shows "Fetching price…", page does not crash.
7. **Test 7** — `insert into market_snapshots (symbol, price, source, fetched_at, status) values ('TCS.NS', 4000, 'manual', now() - interval '20 minutes', 'FRESH')` → run a one-off `node scratchpad-verify-staleness-live.ts` that imports `classifyStaleness` and prints `classifyStaleness("<that fetched_at ISO>")` → `STALE`. Remove the row and script after.
8. **Test 8** — Ctrl-C both processes, restart both → dashboard **Functions** tab lists `snapshot-ingest` + `daily-history-backfill` with cron triggers; either wait ~5 min for an automatic run or trust the Invoke path.

Record pass/fail for each.

- [ ] **Step 5: Update `context.md`**

Add a `## Current state — Phase 3: Market Data Pipeline` section at the top
(above the Phase 2 section), following the existing format: what is built (table
of files), verification status (`npm run typecheck` + `npm run build` results and
which of the 8 acceptance tests passed), manual steps outstanding (run
`npm run inngest`; watch Finnhub usage; the 5-min interval decision), and
deviations (the 5 from the design spec's "Known deviations" section). Move the
Phase 2 "pending browser verification" note forward only if those tests were also
run.

- [ ] **Step 6: Final verification**

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add .env.example README.md context.md middleware.ts
git commit -m "$(cat <<'EOF'
docs: Phase 3 run instructions, acceptance tests, context update

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| A. Adapter layer (`types.ts`, yahoo, finnhub, `index.ts`) | 2, 4, 5, 6 |
| B. Staleness classifier | 3 |
| C. Inngest wiring (client, serve route, script, middleware) | 1, 11, 15 |
| D. Snapshot ingest job (load-symbols, chunk+sleep, getAllQuotes, decay-existing, insert, summary) | 8, 9 |
| E. Daily history backfill job | 8, 10 |
| F. Manual dev trigger route | 12 |
| G. Watchlist page + PriceCell | 13, 14 |
| H. Config / docs / types (`.env.example`, `MarketSnapshotStatus`, no migration, README, context) | 1, 7, 15 |
| Error handling (typed `MarketDataError`, per-symbol skip, timeouts) | 2, 4, 5, 9, 10 |
| Testing (typecheck, build, 8 manual tests) | 3, 6, 13, 14, 15 |
| Dual-source opportunistic 2nd row | 6 (`getAllQuotes`), 9 (row per quote) |

No gaps.

**Placeholder scan:** No "TBD"/"TODO"/"add error handling" — every code step has full source. The two "if the types complain, adjust" notes (Tasks 4, 9) name the specific fallback and preserve the interface contract, not open-ended hand-waving.

**Type consistency:**
- `MarketDataError(code, symbol, source, message?)` — same 3–4 arg shape in Tasks 2, 4, 5, 6, 9, 10.
- `Quote { symbol, price, volume, source, fetchedAt }` — produced in 4/5, consumed in 6/9. Insert rows convert `fetchedAt: Date` → `fetched_at: string` inside the job step (Task 9) so nothing serializes a `Date` across an Inngest step boundary.
- `DailyBar { symbol, date, close, volume }` — produced in 4, consumed in 10.
- `classifyStaleness(fetchedAt, now?)` — defined Task 3, called in Task 9 `decay-existing` and Task 15 test 7.
- `MarketSnapshotStatus` union identical in `staleness.ts` (Task 3) and `types/database.ts` (Task 7).
- `loadWatchlistSymbols()` / `chunk()` — defined Task 8, used in 9 and 10.
- `getAllQuotes` / `getQuote` / `getDailyHistory` — defined Task 6, used in 9 and 10.
- `snapshotIngest` / `dailyHistoryBackfill` export names — defined 9/10, imported in 11.
- `percentChange` / `PriceCell` — defined Task 13, used Task 14.
- Event names `market/snapshot.requested`, `market/history.requested` — identical in Tasks 9, 10, 12.

Consistent throughout.
