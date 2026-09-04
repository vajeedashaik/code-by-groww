# Phase 3 — Market Data Pipeline (Design Spec)

Date: 2026-09-04
Status: approved, pending implementation
Depends on: Phase 1 (auth/DB/RLS), Phase 2 (watchlist CRUD)

## Goal

A scheduled background job fetches current prices for every distinct symbol
across all users' watchlists and stores them as snapshots with source/status
metadata. A separate job backfills daily historical closes. The `/watchlist`
page shows real prices and % change instead of the Phase 2 placeholder.

Out of scope (later phases): meaningfulness scoring, sector/market comparison,
"while you were away" digest, thesis features, staleness UI badges.

## Decisions locked during brainstorming

1. **Scheduler: Inngest** (follows phase3.md). Requires `npx inngest-cli dev`
   alongside `npm run dev` in development.
2. **Cron interval: every 5 minutes.** Staleness bands kept exactly as spec:
   FRESH <2 min, DELAYED 2–10 min, STALE >10 min. Consequence: in steady state
   the watchlist price will usually read `DELAYED` (last fetch 3–5 min ago).
   Treated as honest, not a bug. Nothing surfaces status in the UI until Phase 8.
3. **Dual-source: adapter + opportunistic second row.** The adapter picks the
   best source per symbol for `getQuote()`. The ingest job additionally writes a
   second `market_snapshots` row from any *other* source that also returns data.
   Finnhub's free tier only quotes US symbols, so US-listed stocks naturally get
   two rows per run (yahoo + finnhub) and `.NS` stocks get one. No conflict
   resolution this phase — that data just accumulates for Phase 5+.

## Architecture

### A. Data-adapter layer — `lib/market-data/`

The isolation boundary. Business logic (jobs, pages) imports only from
`lib/market-data`; it never imports `yahoo-finance2` or calls `finnhub.io`
directly.

| File | Role |
| --- | --- |
| `types.ts` | `Quote { symbol, price, volume: number \| null, source, fetchedAt: Date }`; `DailyBar { symbol, date: string /* YYYY-MM-DD */, close, volume: number \| null }`; `MarketDataError extends Error { code: 'NOT_FOUND' \| 'TIMEOUT' \| 'RATE_LIMIT' \| 'SOURCE_ERROR'; symbol; source }`; `MarketDataSource` interface: `name: string`, `supports(symbol): boolean`, `getQuote(symbol): Promise<Quote>`, `getDailyHistory(symbol, days): Promise<DailyBar[]>` |
| `sources/yahoo.ts` | wraps `yahoo-finance2`. `getQuote` → `quote()` (regularMarketPrice, regularMarketVolume). `getDailyHistory` → `chart()` / `historical()` for the last `days` calendar days. `supports()` → `true` for all symbols. 8s timeout via `Promise.race`. Maps "no data"/unknown symbol → `NOT_FOUND`, thrown timeout → `TIMEOUT`, anything else → `SOURCE_ERROR`. |
| `sources/finnhub.ts` | reuses the Phase 2 `fetch` + `AbortSignal.timeout` pattern against `https://finnhub.io/api/v1/quote`. Current price = `c`; no volume on the free tier → `null`. `supports()` → `true` only for symbols with no `.NS`/`.BO` suffix (i.e. US-listed). `getDailyHistory` → always throws `SOURCE_ERROR` (candles are a paid endpoint). `res.status === 429` → `RATE_LIMIT`; `c === 0` or missing → `NOT_FOUND`. Missing `FINNHUB_API_KEY` → `supports()` returns `false`. |
| `index.ts` | public facade. `getQuote(symbol)`: iterate sources in priority order (yahoo, then finnhub), call the first that `supports(symbol)`; on its failure fall through to the next; if all fail, rethrow the last `MarketDataError`. `getAllQuotes(symbol)`: call **every** source that `supports(symbol)`, return the array of successful `Quote`s (≥1 or throw if none succeeded); secondary-source errors are `console.warn`-logged and dropped. `getDailyHistory(symbol, days)`: yahoo only for now (finnhub declines). |

### B. Staleness — `lib/market-data/staleness.ts`

Pure, no I/O:

```ts
type MarketSnapshotStatus = 'FRESH' | 'DELAYED' | 'STALE';
function classifyStaleness(fetchedAt: Date | string, now?: Date): MarketSnapshotStatus;
```

- age < 2 min → `FRESH`
- 2 min ≤ age ≤ 10 min → `DELAYED`
- age > 10 min → `STALE`

Used by the ingest job (both to stamp new rows and to decay old ones) and
exported for future read paths. `MarketSnapshotStatus` is also re-exported from
`types/database.ts`.

### C. Inngest wiring

- New deps: `inngest` (dependency), `inngest-cli` (devDependency).
- `lib/inngest/client.ts` — `export const inngest = new Inngest({ id: "smart-market-watchlist" })`.
- `app/api/inngest/route.ts` — `serve({ client: inngest, functions: [snapshotIngest, dailyHistoryBackfill] })`, exporting `GET`, `POST`, `PUT`.
- Middleware: `/api/inngest(.*)` must remain public (Inngest calls it
  server-to-server). It is not in the `createRouteMatcher` protected list, so
  `auth.protect()` never fires for it — verify during implementation, add an
  explicit exclusion only if Clerk's matcher behaviour requires it.
- `package.json` scripts — add `"inngest": "inngest-cli@latest dev"`.

### D. Snapshot ingest job — `lib/inngest/functions/snapshot-ingest.ts`

```
createFunction(
  { id: "snapshot-ingest" },
  [{ cron: "*/5 * * * *" }, { event: "market/snapshot.requested" }],
  handler,
)
```

Handler steps:

1. `step.run("load-symbols")` — service-role admin client (shared reference
   data, not user-scoped). `select("symbol").from("watchlist_items")`; dedupe +
   uppercase-normalize in JS. Empty → return early `{ processed: 0 }`.
2. Split symbols into chunks of 5. For each chunk index `i`:
   `step.run("fetch-chunk-" + i)` runs the chunk; `step.sleep("throttle-" + i, "1s")`
   between chunks.
3. Per symbol in a chunk: `getAllQuotes(symbol)`. Each returned `Quote` becomes a
   pending insert row `{ symbol, price, volume, source, status: 'FRESH', fetched_at: <now ISO> }`.
   A thrown `MarketDataError` is pushed to `failures: { symbol, code, source }[]`
   and the loop continues. One symbol failing never aborts the batch.
4. `step.run("decay-existing")` — for each symbol, read its current newest
   `market_snapshots` row, recompute `classifyStaleness(fetched_at)`, and
   `UPDATE` that row's `status` if it changed.
5. `step.run("insert-snapshots")` — one bulk `insert` of all pending rows via the
   admin client.
6. Return `{ processed, inserted, failures }` — surfaced in the Inngest
   dashboard run output. The function never throws for per-symbol failures; it
   only throws if Supabase itself is unreachable.

### E. Daily history backfill job — `lib/inngest/functions/daily-history-backfill.ts`

```
createFunction(
  { id: "daily-history-backfill" },
  [{ cron: "30 1 * * *" }, { event: "market/history.requested" }],
  handler,
)
```

- Same symbol-load + chunk-of-5 + 1s-sleep structure.
- Per symbol: `getDailyHistory(symbol, 45)` → `DailyBar[]`.
- `upsert` into `daily_history` with `onConflict: "symbol,date"`.
- Per-symbol failure → `failures[]`, skip, continue.
- Return `{ processed, rowsUpserted, failures }`.

### F. Manual trigger — `app/api/dev/trigger/route.ts`

- `GET` and `POST` handlers.
- If `process.env.NODE_ENV === "production"` → `404`.
- `auth()` from Clerk; no `userId` → `401`.
- `?job=snapshot` (default) → `inngest.send({ name: "market/snapshot.requested" })`.
  `?job=history` → `inngest.send({ name: "market/history.requested" })`.
- Response `{ sent: true, job, ids }`.
- The Inngest dev dashboard's "Invoke" button is the other supported path.

### G. Wire prices into `/watchlist`

`app/(protected)/watchlist/page.tsx` (already a server component, `force-dynamic`):

1. Load `watchlist_items` as today. Collect `symbols`.
2. If `symbols.length`:
   - `market_snapshots`: `select("symbol, price, source, fetched_at, status").in("symbol", symbols).order("fetched_at", { ascending: false })`, then reduce to the first row seen per symbol (newest); on equal `fetched_at`, prefer `source === "yahoo"`.
   - `daily_history`: `select("symbol, date, close").in("symbol", symbols).order("date", { ascending: false })`, reduce to newest row per symbol → `prevClose`.
   - These reads go through the RLS-scoped server client; `market_snapshots` and
     `daily_history` both have a `for select to authenticated using (true)`
     policy from Phase 1, so a signed-in user can read them.
3. New `components/watchlist/price-cell.tsx` (plain server component, no client
   JS): props `{ price?: number; prevClose?: number; }`. Renders
   `₹1,250.40` and, when `prevClose` is present and non-zero, a
   `+1.24%` / `−0.83%` delta coloured green / red (grey for exactly 0).
   No `price` → muted `Fetching price…`. This replaces the
   "Price data coming soon" badge in the list item.
4. No staleness badge rendered (Phase 8), even though `status` is in the query.

### H. Config / docs / types

- `.env.example` — add a comment that `yahoo-finance2` needs no API key; add
  commented-out `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` with a note they are
  only needed for an Inngest Cloud deploy, not local dev.
- `types/database.ts` — no table changes. Add
  `export type MarketSnapshotStatus = 'FRESH' | 'DELAYED' | 'STALE';`.
- **No new SQL migration.** `market_snapshots.status` is free `text` with a
  `'FRESH'` default; `DELAYED` / `STALE` are valid without a schema change.
  `daily_history` already has PK `(symbol, date)` for the upsert.
- `README.md` — new "Phase 3" section: how to run (`npm run dev` +
  `npm run inngest`), the 8 acceptance tests below, and the chosen 5-minute
  interval.
- `context.md` — updated at the end of the phase.

## Error handling summary

- Adapter surfaces one typed error: `MarketDataError` with a `code` of
  `NOT_FOUND` / `TIMEOUT` / `RATE_LIMIT` / `SOURCE_ERROR`.
- Both jobs catch per symbol, accumulate a `failures` array, and continue. A job
  throws only when a shared dependency (Supabase) is down.
- yahoo calls are bounded by an 8s `Promise.race` timeout; finnhub by
  `AbortSignal.timeout(6000)` as in Phase 2.

## Testing

No automated runner (consistent with Phases 1–2). Gate:

- `npm run typecheck` — exit 0.
- `npm run build` — compiles, 0 errors.
- The 8 manual tests from phase3.md:
  1. Manual trigger → new `market_snapshots` rows for every watchlisted symbol.
  2. Add a new stock → trigger again → snapshot appears for it (proves dynamic
     symbol read).
  3. Insert a nonsense symbol directly in Supabase → trigger → it is logged /
     skipped, all other symbols still processed (partial-failure requirement).
  4. Trigger the daily history job → `daily_history` has multiple days per
     symbol.
  5. Reload `/watchlist` → real price + % change for symbols that have
     snapshots.
  6. Add a brand-new stock, view `/watchlist` before the job runs → clean
     `Fetching price…`, no crash, no fake zero.
  7. Insert a `market_snapshots` row with `fetched_at` 20 min ago → the
     staleness function classifies it `STALE`.
  8. Restart `npm run dev` + `inngest dev` clean → the scheduled function is
     registered and fires on its own.

## Known deviations from phase3.md

1. **Finnhub daily candles are a paid endpoint** → daily history is yahoo-only.
   The `MarketDataSource` interface still lets a source decline history, so the
   architecture supports multiple history sources later.
2. **Distinct symbols via JS dedupe**, not SQL `DISTINCT` — supabase-js has no
   first-class distinct; fine at hackathon scale.
3. **"Previous close" = the newest `daily_history` row** for the symbol, not
   strictly the prior trading day (could lag on a holiday or if the backfill
   job hasn't run). Acceptable for Phase 3; revisited when scoring needs
   precision.
4. **Old snapshots decay in the DB only at the next job tick** — the ingest job
   updates the previous newest row's status each run. Between runs the stored
   `status` can be out of date, but nothing reads it live until Phase 8, and the
   pure `classifyStaleness` function is always correct on demand.
5. **5-minute cron → steady-state `/watchlist` usually reads `DELAYED`.**
   Deliberate; the number is honest and the band definitions are the spec's.
