# Project Context — Smart Market Watchlist

Living status doc. Update at the end of each phase.

## Overview

Smart market watchlist web app. 72-hour solo hackathon, 9 phases.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Clerk (auth) · Supabase (Postgres + RLS) · Inngest (scheduled jobs) · yahoo-finance2 + Finnhub (market data).

**Phase plan:** 1 Foundation → 2 Watchlist CRUD → 3 Market Data Pipeline → 4–9 (seen-state/diffing, scoring, digest, thesis, …).

## Current state — Phase 4: Seen-State & Diffing (BUILT, pending browser/manual verification)

Tracks, per user per symbol, which `market_snapshots` row the user last saw,
and computes a raw diff (price/volume/time) against the current latest
snapshot whenever `/watchlist` loads. No scoring/meaningfulness, no
sector/market comparison, no digest UI, no thesis logic — those stay for
Phases 5–7.

### What is built (Phase 4)

| Area | Files |
| --- | --- |
| Latest-snapshot-with-id helper | `lib/watchlist/snapshots.ts` — `latestSnapshotWithIdBySymbol()`; separate from `page.tsx`'s Phase 3 helper because this one needs the row `id` (for writing `last_seen_snapshot_id`), the Phase 3 one didn't |
| Diff computation | `lib/watchlist/diff.ts` — `SymbolDiff` type + `computeDiffsForUser(supabase, userId, symbols)`; exactly 3 queries regardless of watchlist size (seen rows, latest snapshots, "then" snapshots by id) — no N+1; `isFirstView: true` when no seen-state row exists (or its `last_seen_snapshot_id` is null) instead of a fake zero-delta |
| Mark-as-seen | `app/(protected)/watchlist/actions.ts` — `markWatchlistSeen()` server action; re-queries the *current* latest snapshot per symbol server-side at write time (never trusts a client-supplied snapshot id) — this is the race-condition policy; upserts on the Phase 1 `(user_id, symbol)` primary key, so repeated calls are idempotent; skips symbols with no snapshot yet (no null-id row written) |
| Diffs API | `app/api/watchlist/diffs/route.ts` — `GET /api/watchlist/diffs`, Clerk-gated, returns every current-watchlist symbol's diff in one response |
| Time phrasing | `lib/watchlist/format-elapsed.ts` — `formatElapsed(ms)`, relative phrasing ("4 hours ago") chosen over an exact timestamp — matches the phase4 brief's own example copy and the casual tone Phase 6's digest is meant to have |
| UI wiring | `components/watchlist/diff-panel.tsx` — `WatchlistDiffsProvider` (client, fetches `/api/watchlist/diffs` once on mount via React Context, then calls `markWatchlistSeen()` only after the diffs are in state — never before) + `DiffLine` (renders one symbol's diff, or "First time viewing") |
| Modified | `app/(protected)/watchlist/page.tsx` (wraps the item list in `WatchlistDiffsProvider`, adds a `DiffLine` per row) |

### Race condition policy (Task 2 of phase4.md)

**Chosen policy: always mark-as-seen against whatever snapshot is actually
current at the moment the write happens, re-queried server-side.**
`markWatchlistSeen()` takes no snapshot id as input at all — it looks up
"latest `market_snapshots` row per symbol, right now" itself, inside the
action, every time it runs. So in the spec's example sequence (client reads
snapshot A, a background job writes B, then the stale mark-as-seen request
from the A-page-load fires), the action's own query returns B — it marks B
seen, not A. Nothing is silently lost at the data layer: the seen-state
always ends up pointing at a real snapshot that existed at write time.

The one accepted UI-level gap: if B is written *after* the diff panel's
fetch but *before* `markWatchlistSeen()` fires (a few-hundred-ms window),
the user's displayed diff was computed against A as "current" but seen-state
gets marked against B — so B's own change is marked seen without ever being
shown as a diff. This is a display-timing gap, not data corruption, and is
exactly the kind of case Phase 5+ (which will presumably re-diff against
what was actually last *shown*, or accept this as bounded staleness) can
revisit; Phase 4's job was correctness of the stored state, not eliminating
every possible display race.

### Removed-item seen-state decision (Task 8 of phase4.md)

**Chosen: leave orphaned `user_seen_state` rows in place, ignore them.**
Both `markWatchlistSeen()` and `computeDiffsForUser()` derive their symbol
list from the user's *current* `watchlist_items`, so a row for a symbol the
user has since removed is simply never read or written again — no ghost
entries reach the diff API, no error path exists. Mirrors the Phase 3
precedent of leaving `daily_history` rows in place after the smoke test —
dead reference rows are an accepted, harmless gap, not corruption. A future
retention/cleanup job (if ever needed) can be added without touching this
phase's logic.

### Phase 4 verification

- `npx tsc --noEmit` — exit 0, no output.
- `npx next build` — compiled successfully, 11 routes + middleware, 0
  errors. `/api/watchlist/diffs` listed as a dynamic (ƒ) route.
- **Browser/manual tests — not yet run** (need a real Clerk session +
  manual Inngest-dashboard triggering for the race-condition scenarios).
  See phase4.md's 8-item TESTING list; all 8 are the user's job, same as
  Phase 3's browser tests. In particular tests 3 and 5 (trigger a new
  snapshot at a specific moment mid-flow) and tests 4/7/8 (visually
  inspecting `user_seen_state` in Supabase) cannot be done headlessly.

### Phase 4 manual steps outstanding (from phase4.md's "MANUAL STEPS")

- [ ] Manually trigger the Phase 3 snapshot job via the Inngest dev
  dashboard at a specific moment while `/watchlist` is open, to exercise the
  race-condition scenario (tests 3 and 5).
- [ ] Inspect `user_seen_state` in Supabase's table editor after each test
  scenario to visually confirm exactly one row per `(user, symbol)`.
- [x] Decide "last checked" phrasing — relative ("4 hours ago"), see
  `lib/watchlist/format-elapsed.ts` and the note above.

### Phase 4 deviations from spec

1. **`markWatchlistSeen` is a server action, not a separate API route** —
   phase4.md's Task 1 allows either ("server action / API route"); a server
   action can be called directly from the client component without an extra
   fetch round trip, and Next.js RPCs it automatically.
2. **Diff display goes through the API route even though `/watchlist` is a
   Server Component that could compute diffs inline** — deliberate, so the
   diffs genuinely arrive as one batched `GET /api/watchlist/diffs` request
   observable in the browser's network tab (acceptance test 6 asks for
   exactly this), and so `markWatchlistSeen()` can be sequenced to fire
   strictly after the diff is rendered (client-side `useEffect`), which a
   pure Server Component render can't express.
3. **No test runner** — same Phase 2 deviation still applies; verification
   is `tsc`/`build`/manual browser tests, not automated unit tests.

## Current state — Phase 3: Market Data Pipeline (COMPLETE, pending browser verification)

Two Inngest scheduled jobs now keep real prices and daily history flowing into
`market_snapshots` and `daily_history` for every symbol across all users'
watchlists, and `/watchlist` shows the real price + % change (or a clean
"Fetching price…" state) instead of the Phase 2 placeholder. No scoring,
meaningfulness engine, digest, or thesis usage yet — those stay for later
phases.

### What is built (Phase 3)

| Area | Files |
| --- | --- |
| Adapter types | `lib/market-data/types.ts` — `Quote`, `DailyBar`, `MarketDataSource` interface, `MarketDataError` (code + symbol + source + optional `cause`) |
| Staleness | `lib/market-data/staleness.ts` — `classifyStaleness(fetchedAt, now?)`: FRESH <2min, DELAYED 2–10min (inclusive), STALE >10min; canonical (only) home of `MarketSnapshotStatus` |
| Yahoo source | `lib/market-data/sources/yahoo.ts` — primary source via `yahoo-finance2` v4's class API; `getQuote` + `getDailyHistory` (drops the in-progress today-dated bar); maps 429/not-found/other errors to `MarketDataError` codes; 8s timeout |
| Finnhub source | `lib/market-data/sources/finnhub.ts` — secondary source, US symbols only (`supports()` false for `.NS`/`.BO`); reuses `FINNHUB_API_KEY`; key sent via `X-Finnhub-Token` header; declines `getDailyHistory` (paid endpoint on free tier) |
| Facade | `lib/market-data/index.ts` — the only module consumers import; `getQuote` (best single answer), `getAllQuotes` (every source's quotes + per-source errors, for the snapshot job's partial-failure tracking), `getDailyHistory` (first source that answers) |
| Inngest client | `lib/inngest/client.ts` — single `Inngest` instance, `isDev` pinned outside production so local dev needs no event/signing keys |
| Job helpers | `lib/inngest/functions/shared.ts` — `loadWatchlistSymbols()` (distinct, trimmed, upper-cased symbols via the admin/service-role client), `chunk()` |
| Snapshot job | `lib/inngest/functions/snapshot-ingest.ts` — cron `*/5 * * * *` + `market/snapshot.requested` event; chunks of 5 symbols with a 1s gap; writes one `market_snapshots` row per source that answered; per-symbol total failure -> `failures`, a secondary source failing while the symbol still got data -> `secondaryFailures`; also decays the status of recent (last 15 min) existing rows before inserting new ones |
| History job | `lib/inngest/functions/daily-history-backfill.ts` — cron `30 1 * * *` + `market/history.requested` event; same chunking/partial-failure pattern; upserts `daily_history` on `(symbol, date)`; `HISTORY_DAYS = 60` calendar days requested |
| Inngest route | `app/api/inngest/route.ts` — `serve()` registering both functions; not Clerk-protected (confirmed by curl: `function_count: 2`, HTTP 200, no redirect/401) |
| Dev trigger | `app/api/dev/trigger/route.ts` — Clerk-gated, 404s in production; `GET`/`POST /api/dev/trigger?job=snapshot\|history` fires the corresponding event; GET is deliberately state-changing for curl convenience (documented trade-off, narrow blast radius) |
| Price UI | `components/watchlist/price-cell.tsx` — server component; formats INR price + colored % change, or a muted "Fetching price…" badge when no snapshot exists yet |
| Modified | `app/(protected)/watchlist/page.tsx` (joins latest `market_snapshots` + `daily_history` per symbol, bounded with `.limit(symbols.length * 10)`), `package.json` (`yahoo-finance2`, `inngest`, `inngest-cli` deps + `npm run inngest` script), `next.config.ts`, `.env.example` (Phase 3 + Inngest sections), `README.md` (Phase 3 sections + routes/scripts tables) |

### Phase 3 verification

- `npm run typecheck` (`tsc --noEmit`) — exit 0, no output.
- `npm run build` (`next build`) — compiled successfully in ~8.5s, 10 routes +
  middleware, 0 errors. `/api/inngest` and `/api/dev/trigger` both listed as
  dynamic (ƒ) routes.
- **Backend smoke test** (Part D of Task 15 — no browser/Clerk session
  available, so this validates the pipeline at the data layer instead):
  - Started `npm run dev` + `npm run inngest` (dev servers on :3000/:8288);
    confirmed both up (`/api/inngest` → `function_count: 2`, `:8288` → 200).
  - Inserted two temporary `watchlist_items` rows under a fake
    `user_id: "test-phase3-verification"`: `RELIANCE.NS` (real, liquid) and
    `ZZFAKE123.NS` (nonsense).
  - Fired `market/snapshot.requested` directly at the Inngest dev server's
    event endpoint (`POST http://localhost:8288/e/<key>`) — no Clerk cookie
    needed for this path. Run completed; querying `market_snapshots` showed
    **exactly one new row, for `RELIANCE.NS`** (yahoo, real price ₹1322,
    volume, `status: FRESH`) and **zero rows for `ZZFAKE123.NS`** — the
    partial-failure contract holds: one bad symbol is skipped, everything
    else still processed.
  - Fired `market/history.requested` the same way. Run completed; querying
    `daily_history` showed **44 dated rows for `RELIANCE.NS`** (matches the
    ~45-trading-day target from 60 requested calendar days) and **zero rows
    for `ZZFAKE123.NS`**.
  - Cleaned up: deleted both temporary `watchlist_items` rows, deleted the
    one `market_snapshots` row this test created (by its known id), and
    confirmed no `ZZFAKE123.NS` rows existed in either table to delete.
    `RELIANCE.NS`'s `daily_history` rows were deliberately **left in place**
    — that table has no created/fetched timestamp to distinguish "this
    test's rows" from pre-existing real backfill data, and the rows are
    exactly the legitimate demo data Phase 3 is meant to produce, not test
    pollution. Stopped both dev servers by PID and confirmed via `netstat`
    that no LISTENING socket remains on :3000 or :8288.
  - This is a genuine end-to-end pass of both jobs against the real Supabase
    project, exercising real Yahoo Finance data and the exact partial-failure
    path required by acceptance test 3.

### Final holistic review (whole-phase, after all 15 tasks)

A last cross-file review (beyond the per-task spec/quality reviews already
folded into the sections above) checked contract consistency across every
consumer, that the `lib/market-data` isolation boundary genuinely holds
(grepped the whole tree for `yahoo-finance2`/`finnhub.io` outside
`lib/market-data/sources/` — clean), naming/style parity between the two
Inngest jobs, and secrets handling. Result: **no Critical or Important
findings — recommended ready to hand back as "Phase 3 complete."** One Minor
was fixed immediately: both job files (`snapshot-ingest.ts`,
`daily-history-backfill.ts`) were missing the `import "server-only";` guard
that every other secret-touching file in the phase has; added in commit
`d3c02f9`. Three remaining Minors, left as documented follow-ups (none block
a demo, none read live yet):
- `decay-existing` dedupes by `symbol` only, so when a US symbol has two
  same-`fetched_at` rows (yahoo + finnhub), only one gets its `status`
  corrected per pass — harmless while nothing reads `status` live.
- `getQuote` (single-best-answer facade function) has no current caller —
  intentional per the plan's 3-function facade design, kept for a plausible
  future use (e.g. an instant price on the add-stock flow), not dead-code
  debris.
- `classifyStaleness`/`MarketSnapshotStatus` are imported directly from
  `lib/market-data/staleness.ts` rather than through the `index.ts` barrel —
  both are inside the isolation boundary, so this is a discoverability nit,
  not a boundary break.

**Phase 3 acceptance tests (from README) — status:**

| # | Test | Status |
| - | --- | --- |
| 1 | Trigger snapshot → new rows for every watchlisted symbol | Verified (data layer) via the smoke test above; the *UI* half (visually confirming in the Inngest dashboard / Supabase table view) is still the user's job |
| 2 | Add a new stock, trigger again → snapshot appears for it too | Not run — needs the `/watchlist` add-stock UI (Clerk session) to add a stock the normal way; user must run this |
| 3 | Nonsense symbol → logged/skipped, others still processed | **Verified** — `ZZFAKE123.NS` produced zero rows in both tables while `RELIANCE.NS` succeeded, in the same run |
| 4 | Trigger history → multiple dated rows per symbol | **Verified** — 44 dated rows for `RELIANCE.NS` |
| 5 | Reload `/watchlist` → real price + % change | Needs a browser + Clerk session — user's job |
| 6 | New stock, view `/watchlist` before job runs → clean "Fetching price…" | Needs a browser + Clerk session — user's job |
| 7 | Old `fetched_at` (20 min ago) → `classifyStaleness` returns STALE | Not re-verified in this pass, but covered by the function's own logic (pure, no I/O) and matches phase3.md's worked example exactly (age > 10 min → STALE); user can spot-check with a manual Supabase insert if desired |
| 8 | Restart both dev servers clean → functions registered, cron fires on its own | Partially verified — both servers were confirmed to start clean and register (`function_count: 2`); waiting for the cron to fire unattended (5 min / next-day) was out of scope for this bounded smoke test — user's job |

### Phase 3 manual steps outstanding (from phase3.md's "MANUAL STEPS")

- [ ] Run `npx inngest-cli dev` locally alongside `npm run dev` (now documented
  as `npm run inngest` in the README) — needed every time you want the
  scheduled/background functions to actually execute in dev.
- [ ] Manually trigger both jobs via the Inngest dev dashboard
  (`http://localhost:8288`) and visually confirm the rows in Supabase's table
  editor — the smoke test above confirmed this at the data layer, but you
  should see it with your own eyes at least once.
- [ ] Watch the Finnhub usage dashboard while testing to confirm you're not
  approaching rate limits (Finnhub is only hit for US symbols in this repo's
  current watchlist contents, so usage should be low, but confirm at scale).
- [ ] Confirm the 5-minute polling interval is acceptable at your real
  watchlist scale — already chosen and documented in the README, but you
  should confirm it holds up once you have a realistic number of symbols.
- [ ] If you deploy to Vercel before the hackathon deadline, Inngest functions
  need separate registration with Inngest Cloud plus `INNGEST_EVENT_KEY` /
  `INNGEST_SIGNING_KEY` set in that environment — not needed for local
  dev/demo, but flag it before deploying.

### Phase 3 deviations from spec

1. **Inngest v4's real API differs from what phase3.md assumed.**
   `createFunction({ id, name, triggers: [...] }, handler)` — a 2-argument
   call with the trigger list nested inside the options object — replaces the
   plan's literal `createFunction(config, [triggers], handler)` 3-argument
   form. Applied consistently to both `snapshot-ingest.ts` and
   `daily-history-backfill.ts`.
2. **`getAllQuotes(symbol)` returns `{ quotes: Quote[]; errors: MarketDataError[] }`**
   instead of a bare `Quote[]`, added during code review so the snapshot job
   can distinguish "this symbol got nothing" (`failures`, a hard skip) from
   "a secondary source failed but the symbol still got data" (tracked
   separately as `secondaryFailures`, not a hard failure).
3. **Task 7 (re-exporting `MarketSnapshotStatus` from `types/database.ts`) was
   implemented then reverted before being committed** — confirmed by git
   history: `types/database.ts` was not touched by any Phase 3 commit. The
   file's own header says it will be regenerated by `supabase gen types`,
   which would silently clobber a hand-added export. `MarketSnapshotStatus`
   lives only in `lib/market-data/staleness.ts`.
4. **`yahoo.ts`'s `getDailyHistory` drops a trailing today-dated bar** (the
   in-progress trading session) before returning, so `daily_history` never
   accidentally stores an intraday price as a day's official close.
5. **`HISTORY_DAYS` is 60, not 45** — chosen to net a real ~45 trading days
   after Yahoo's observed ~77% calendar-to-trading-day yield (weekends and
   holidays excluded). Confirmed in the smoke test: 60 calendar days
   requested produced 44 actual rows for `RELIANCE.NS`.
6. **`decay-existing` in the snapshot job is bounded to a 15-minute lookback
   window** (not a full-table scan) and parallelizes its per-row status
   updates, to avoid an unbounded, ever-growing query as `market_snapshots`
   accumulates history over the life of the project.
7. **The `/watchlist` page's snapshot/history queries are bounded with
   `.limit(symbols.length * 10)`** for the same reason — see the README's
   "Known limitation" note. Full DB-side dedup (indexes + a `DISTINCT ON`
   view/RPC) and a retention/pruning job for `market_snapshots` /
   `daily_history` are accepted gaps, deferred past this hackathon phase.
8. **`MarketDataError` gained an optional `{ cause }` passthrough** (not in
   the original plan snippet) to preserve root-cause detail across the
   adapter boundary without leaking it into the error's own `.message`.
9. **Finnhub's API key is sent via the `X-Finnhub-Token` header, not the
   `?token=` query string** — added during review so the key never appears in
   a logged request URL (e.g. inside an `error.cause`).
10. **`/api/dev/trigger`'s `GET` handler is intentionally state-changing**
    (fires a job on a plain `GET`) — a deliberate, documented trade-off for
    curl/browser-address-bar convenience on a dev-only, production-404'd,
    Clerk-gated route, not an oversight.
11. **The snapshot job's per-source-failure logging is not duplicated** —
    `getAllQuotes()` already `console.warn`s each secondary-source failure
    inside `lib/market-data/index.ts`, so `snapshot-ingest.ts` only collects
    those into `secondaryFailures` without re-logging them; only a symbol's
    *total* failure gets a second, more specific `console.error` in the job
    itself. (Observed while reading the actual code for this task; not one
    of the deviations called out in the implementation plan, but a real,
    deliberate choice worth recording.)

## Current state — Phase 2: Watchlist CRUD (COMPLETE, pending browser verification)

Users can search real stocks, add them to a per-user watchlist with an optional
thesis + target price, view the list, and remove items with a confirm step.
All persisted in Supabase under the Phase 1 RLS policies. No live prices,
scoring, digest, or thesis usage — those stay for later phases.

### What is built (Phase 2)

| Area | Files |
| --- | --- |
| Search API | `app/api/search/route.ts` — `GET /api/search?q=`, auth-gated (401 if signed out), merges Finnhub `/search` + local NSE list, de-dupes by symbol, degrades to fallback-only + `error` flag on any Finnhub failure/rate-limit/missing key |
| NSE fallback | `lib/stocks/nse-fallback.ts` — 40 liquid NSE symbols (`.NS` suffix) across sectors + `filterNseFallback()`; trade-off documented in file header |
| Search types | `lib/stocks/types.ts` — `StockSearchResult`, `StockSearchResponse` |
| Debounce | `lib/hooks/use-debounce.ts` — generic `useDebounce(value, delay=300)` |
| Watchlist page | `app/(protected)/watchlist/page.tsx` — server component, lists items `added_at desc`, empty state, "Price data coming soon" placeholder, load-error state |
| Server actions | `app/(protected)/watchlist/actions.ts` — `addWatchlistItem` (trims/validates, parses target price, soft-handles `23505` unique violation), `removeWatchlistItem` (explicit `user_id` filter + RLS backstop, `.select("id")` to detect no-op); both `revalidatePath("/watchlist")` |
| Client UI | `components/watchlist/add-stock.tsx` (debounced search box + dropdown + add form, outside-click close, `useTransition`), `components/watchlist/remove-stock-button.tsx` (inline two-step confirm, no native `confirm()`) |
| DB migration | `supabase/migrations/0003_watchlist_company_name.sql` — `alter table watchlist_items add column company_name text` (nullable, denormalised from search metadata) |
| Types | `types/database.ts` — `company_name` added to `watchlist_items` Row/Insert/Update |
| Nav / config | `middleware.ts` protects `/watchlist(.*)`; `components/header.tsx` gets a Watchlist link; `.env.example` gets `FINNHUB_API_KEY`; `supabase/schema.sql` + `README.md` updated |

### Phase 2 verification

- `npx tsc --noEmit` — exit 0
- `npx next build` — 8 routes + middleware compile, 0 errors (`/watchlist` 2.28 kB, `/api/search` added)
- Browser tests **pending** — see README "Phase 2 acceptance tests" (9 items).

### Phase 2 manual steps

- [x] Finnhub API key obtained (free tier). Add it to `.env.local` as
  `FINNHUB_API_KEY=` — the file is open in the IDE and gitignored.
- [ ] Run `supabase/migrations/0003_watchlist_company_name.sql` in the Supabase
  SQL editor.
- [ ] Confirm the 40-symbol NSE fallback list covers intended demo stocks; edit
  `lib/stocks/nse-fallback.ts` if not.
- [ ] Manually tune debounce feel (currently 350 ms) in the browser.
- [ ] Run the 9 README "Phase 2 acceptance tests" in a browser.

### Phase 2 deviations from spec

1. **No "Signalist reference project"** in the repo — the debounce hook is a
   standard `setTimeout`/`clearTimeout` implementation, not adapted from it.
2. **Search is a route handler**, not a server action — debounced client-side
   fetches map more naturally to `GET /api/search`, and it keeps
   `FINNHUB_API_KEY` server-only.
3. **`company_name` denormalised** onto `watchlist_items` (new column) rather
   than looked up at render — the watchlist view needs no external call and
   still renders if Finnhub is down.
4. **No automated tests** — repo has no test runner (no jest/vitest); hackathon
   pace. Acceptance is the 9 manual browser tests.
5. **>50 items allowed, uncapped** — noted in an `actions.ts` comment as the
   design scale, not enforced.

## Phase 1: Foundation (COMPLETE, pending browser verification)

Deployable skeleton: authentication + database schema + RLS. No market data, no
watchlist UI beyond the `/debug` sanity check, no scoring.

### What is built

| Area | Files |
| --- | --- |
| Config | `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env.example` |
| Root shell | `app/layout.tsx` (ClerkProvider + Header + `<main>`), `app/globals.css` (`@import "tailwindcss"`) |
| Public | `app/page.tsx` (landing), `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx` |
| Protected | `app/(protected)/layout.tsx` (`await auth.protect()`), `app/(protected)/dashboard/page.tsx` (`Welcome, {firstName}`), `app/(protected)/debug/page.tsx` (auth+RLS+DB round-trip) |
| Auth gate | `middleware.ts` — `clerkMiddleware` + `createRouteMatcher(['/dashboard(.*)','/debug(.*)'])` → `auth.protect()` |
| Header | `components/header.tsx` — app name, `<UserButton/>` (signed in) / `<SignInButton mode="modal">` (signed out) |
| Supabase clients | `lib/supabase/server.ts` (RSC/actions, Clerk token via `accessToken`), `lib/supabase/client.ts` (`useBrowserSupabaseClient` hook, unused in P1), `lib/supabase/admin.ts` (service role, bypasses RLS, server-only) |
| Types | `types/database.ts` — hand-written `Database` type for all 5 tables |
| SQL | `supabase/migrations/0001_init.sql` (tables), `supabase/migrations/0002_rls.sql` (RLS + policies), `supabase/schema.sql` (combined reference) |
| Docs | `README.md`, `docs/superpowers/specs/2026-09-04-phase1-foundation-design.md`, this file |

### Database schema (in `supabase/migrations/`)

Five tables in `public`:

- `watchlist_items` — `id uuid pk`, `user_id text not null default (auth.jwt()->>'sub')`, `symbol text`, `thesis text`, `target_price numeric`, `added_at timestamptz`, `unique(user_id, symbol)`. **RLS on.**
- `market_snapshots` — `id uuid pk`, `symbol`, `price numeric`, `volume bigint`, `source text`, `fetched_at timestamptz`, `status text default 'FRESH'`. **RLS on, select-only for users.**
- `user_seen_state` — `user_id text default (auth.jwt()->>'sub')`, `symbol text`, `last_seen_snapshot_id uuid → market_snapshots(id)`, `seen_at timestamptz`, `primary key (user_id, symbol)`. **RLS on.**
- `daily_history` — `symbol text`, `date date`, `close numeric`, `volume bigint`, `primary key (symbol, date)`. **RLS on, select-only for users.**
- `change_events` — `id uuid pk`, `user_id text default (auth.jwt()->>'sub')`, `symbol text`, `detected_at timestamptz`, `meaningfulness_score numeric`, `magnitude numeric`, `confidence text`, `explanation jsonb`, `thesis_verdict text`. **RLS on.**

### RLS model

- **User-scoped** (`watchlist_items`, `user_seen_state`, `change_events`): 4 policies each (select/insert/update/delete), role `authenticated`, predicate `(select auth.jwt()->>'sub') = user_id`.
- **Shared reference** (`market_snapshots`, `daily_history`): single `for select to authenticated using (true)`. No write policies → only the service-role key writes.

### Auth integration

Clerk **native** third-party auth for Supabase (JWT template deprecated Apr 2025).
Supabase clients attach the Clerk session token through the `accessToken` option;
Postgres RLS reads the Clerk user id from `auth.jwt() ->> 'sub'`. `user_id`
columns default to that claim, so inserts need no explicit `user_id`.

### Environment variables

Listed in `.env.example`. Real values live in `.env.local` (gitignored). Required:
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
`NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`,
`NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`,
`NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`.

### Routes

| Path | Access | Purpose |
| --- | --- | --- |
| `/` | public | Landing |
| `/sign-in`, `/sign-up` | public | Clerk components |
| `/dashboard` | authenticated | `Welcome, {name}` — auth proof |
| `/debug` | authenticated | Temporary — auth + RLS + DB round-trip. Remove in a later phase. |

## Verification status

Done by Claude (no browser / no Clerk session available):

- `npm install` — ok (123 packages)
- `npx tsc --noEmit` — exit 0
- `npx next build` — all 6 routes + middleware compile, 0 errors
- `npx next dev` — boots clean on real keys, reads `.env.local`
- `GET /` → 200, `GET /sign-in` → 200
- `GET /dashboard`, `/debug` via curl → 404 with `x-clerk-auth-reason: protect-rewrite, dev-browser-missing`. This is Clerk's dev-mode handshake failing for a cookieless client (curl), **not** a routing bug — middleware runs and protects the route; a real browser is redirected to `/sign-in`.

Pending — user must run in a browser with real Clerk users (README "Phase 1 acceptance tests"):

1. Sign up → redirected to `/dashboard`, name shows.
2. Sign out → sign in → session persists, lands on `/dashboard`.
3. `/dashboard` while signed out → redirected to sign-in.
4. `/debug` as User A → insert TEST row, reads back, deletes (all steps green).
5. User B cannot see or query User A's `watchlist_items` rows (RLS proof).
6. Supabase dashboard shows all 5 tables with correct columns/constraints — verify `unique(user_id, symbol)` on `watchlist_items` and composite PK on `user_seen_state`.
7. Fresh clone + `.env.local` filled → `npm run dev` boots with no missing-config errors.

Also still required (one-time, in dashboards): run `0001_init.sql` then
`0002_rls.sql` in the Supabase SQL editor; add Clerk as a Third-Party Auth
provider in Supabase and paste the Clerk domain. See README steps 3–4.

## Deviations from the Phase 1 spec

1. **Browser Supabase client is a hook** (`useBrowserSupabaseClient()`), not a plain `createBrowserSupabaseClient()` factory — the Clerk session is only reachable through React context. Unused in Phase 1; ready for later phases.
2. **Env var name** `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Clerk docs sometimes call it `PUBLISHABLE_KEY`; same value).
3. **`.env.local` was created** with placeholder keys so `next build` could compile before real keys existed; user has since filled in real keys. Gitignored.
4. **Tailwind v4** (config-less, `@import "tailwindcss"` + `@tailwindcss/postcss`) — spec said only "Tailwind CSS".
5. **Sign-in/up**: both dedicated Clerk pages *and* a modal `<SignInButton>` in the header. Header uses the real `<UserButton/>` for the "user menu placeholder".

## Git

All work so far is on `master` (no feature branches, no remote configured).
16 commits from Phase 1 through Phase 3, oldest first:

- `3d41835` docs: Phase 1 foundation design spec
- `4f8ea2b` feat: Phase 1 foundation scaffold
- `8ae5cc4` docs: Phase 3 market data pipeline design spec
- `a0a989e` docs: Phase 3 market data implementation plan
- `002a701` feat: Phase 2 watchlist CRUD + stock search
- `cef79f0` chore: add yahoo-finance2 + inngest, scaffold inngest serve route
- `7fe1906` feat: market-data adapter types
- `da6b4b2` feat: classifyStaleness snapshot freshness grader
- `2a818ce` feat: yahoo-finance2 market-data source (quotes + daily history)
- `59ea95c` feat: finnhub secondary market-data source (US quotes only)
- `c327e12` feat: market-data facade (getQuote / getAllQuotes / getDailyHistory)
- `9986a2a` feat: shared inngest job helpers (symbol load, chunk)
- `0b7c4aa` feat: snapshot-ingest inngest job (5-min cron, partial-failure safe)
- `7590179` feat: daily-history-backfill inngest job (daily cron, upsert)
- `7a7f8f5` feat: register snapshot + history jobs on the inngest serve route
- `b853b66` refactor: bump HISTORY_DAYS to 60, drop redundant HistoryRow type
- `3de4b90` feat: dev-only auth-gated manual trigger for the market jobs
- `0c91ac6` feat: PriceCell — price + % change with fetching-price fallback
- `d3e796a` feat: show live snapshot price + % change on the watchlist page
- `62e784f` docs: Phase 3 run instructions, acceptance tests, context update
- `d3c02f9` chore: add server-only guard to both inngest job files (HEAD)

(Phase 3 design/plan docs were written and committed before Phase 2's own
code was committed — the design/plan work happened first in the session,
Phase 2 code landed right after. Order above is chronological by commit,
not by phase number.)

`node_modules/`, `.next/`, `.env*.local` are gitignored. `phase2.md` was
committed with the scaffold by accident — harmless. `phase3.md` (this
phase's informal brief) and `phase4.md` (next phase's brief, dropped in by
the user, not yet reviewed) currently sit **untracked** in the working tree.

## How to continue

- Local run: fill `.env.local` (now incl. `FINNHUB_API_KEY`), run migrations
  `0001`→`0003`, `npm install`, `npm run dev` + `npm run inngest`, open
  `http://localhost:3000`.
- Phase 3 built, compiling, and backend-smoke-tested (see the Phase 3 section
  above). Run the README "Phase 3 acceptance tests" in a browser — especially
  #2, #5, #6, and the full unattended #8.
- Phase 4 built and compiling (see the Phase 4 section above) — seen-state
  tracking + raw diffing, `GET /api/watchlist/diffs`, diff shown on
  `/watchlist` before mark-as-seen fires. Run phase4.md's 8-item TESTING list
  in a browser (needs manual Inngest-dashboard triggers for the
  race-condition scenarios) before starting Phase 5 (Meaningfulness Engine).
