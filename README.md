# Smart Market Watchlist

Smart market watchlist web app. **Phases 1–3 complete**: authentication
(Clerk), database schema (Supabase + RLS), per-user watchlist CRUD with stock
search, and a scheduled market-data pipeline (Inngest) that keeps real prices
and daily history flowing. No scoring, digest, or thesis usage yet.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Clerk · Supabase ·
Finnhub (stock search) · Inngest (scheduled market-data jobs) · yahoo-finance2
(prices).

## Prerequisites

- Node 20+ and npm
- A [Clerk](https://dashboard.clerk.com) account
- A [Supabase](https://supabase.com/dashboard) project

## Setup

### 1. Clerk application

1. Create an application in the Clerk dashboard.
2. **API Keys** → copy the **Publishable key** and **Secret key**.

### 2. Supabase project

1. Create a project in the Supabase dashboard.
2. **Project Settings → API** → copy the **Project URL**, the **anon / publishable**
   key, and the **service_role / secret** key.

### 3. Run the migrations

In the Supabase **SQL Editor**, run these files in order:

1. `supabase/migrations/0001_init.sql` — creates the five tables.
2. `supabase/migrations/0002_rls.sql` — enables RLS and adds policies.
3. `supabase/migrations/0003_watchlist_company_name.sql` — adds
   `watchlist_items.company_name` (Phase 2).

(`supabase/schema.sql` is the same content combined, for reference only.)

### 4. Wire Clerk as a third-party auth provider for Supabase

Uses Clerk's **native** Supabase integration (the JWT template is deprecated).

1. In Supabase: **Authentication → Sign In / Providers → Third Party Auth** →
   **Add provider → Clerk**.
2. Open the "Connect with Supabase" page linked in that modal (it goes to Clerk),
   pick this Clerk app, enable the integration, and copy the **Clerk domain** it
   shows.
3. Paste that domain into the Supabase provider settings and save.

RLS policies read the Clerk user id from `auth.jwt() ->> 'sub'`. The app's
Supabase clients attach the Clerk session token via the `accessToken` option
(see `lib/supabase/`).

### 5. Environment variables

```bash
cp .env.example .env.local
```

Fill every value in `.env.local` from steps 1–2, plus a free
[Finnhub](https://finnhub.io) API key as `FINNHUB_API_KEY` (Phase 2 stock
search, also used for Phase 7's company-news lookup; search falls back to a
static NSE list if it's missing) and a free
[Gemini](https://aistudio.google.com/apikey) API key as `GEMINI_API_KEY`
(Phase 7 — the one AI call in this product). `.env.local` is gitignored —
never commit real keys.

### 6. Run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Routes

| Path         | Access        | Purpose                                             |
| ------------ | ------------- | -------------------------------------------------- |
| `/`          | public        | Landing page                                       |
| `/sign-in`   | public        | Clerk sign-in                                      |
| `/sign-up`   | public        | Clerk sign-up                                      |
| `/dashboard` | authenticated | "While you were away" digest — Urgent/Notable/Routine buckets, why-flagged detail (Phase 6) |
| `/watchlist` | authenticated | Stock search + per-user watchlist CRUD, raw table view (Phase 2/4) |
| `/debug`     | authenticated | **temporary** — auth + RLS + DB round-trip check   |
| `/api/search`| authenticated | JSON stock search (Finnhub + static NSE fallback)   |
| `/api/inngest`| internal      | Inngest sync/invoke endpoint (not user-facing)     |
| `/api/dev/trigger` | authenticated, dev-only | Manually fire `?job=snapshot` or `?job=history` |

Unauthenticated requests to `/dashboard`, `/watchlist`, or `/debug` redirect to
sign-in (`middleware.ts`); `/api/search` returns `401`.

## Project layout

```
app/
  layout.tsx              root layout, ClerkProvider, header
  page.tsx                public landing
  (protected)/            route group — auth.protect() gate
    dashboard/page.tsx
    debug/page.tsx
    watchlist/page.tsx    watchlist view + add form
    watchlist/actions.ts  add / remove server actions
  api/search/route.ts     stock search (Finnhub + NSE fallback)
  sign-in/, sign-up/      Clerk components
components/header.tsx     app name + user menu
components/watchlist/     add-stock + remove-stock-button client components
lib/hooks/use-debounce.ts  debounced value hook (search input)
lib/stocks/              NSE fallback list, search types
lib/supabase/             server / browser / admin clients
types/database.ts         hand-written row types
middleware.ts             Clerk middleware, protects /dashboard + /watchlist + /debug
supabase/migrations/      versioned SQL — run in the dashboard
```

## Scripts

| Command             | What                              |
| ------------------- | --------------------------------- |
| `npm run dev`       | dev server                        |
| `npm run build`     | production build                  |
| `npm run start`     | serve the production build        |
| `npm run typecheck` | `tsc --noEmit`                    |
| `npm run inngest`   | Inngest dev server (run alongside `npm run dev`) |
| `npm run verify:scoring` | pure-logic checks for `lib/scoring/` (Phase 5) |
| `npm run verify:digest`  | pure-logic checks for `lib/digest/` (Phase 6)  |
| `npm run verify:thesis`  | pure-logic checks for `lib/thesis/` (Phase 7)  |

## Phase 3: market data

Two Inngest jobs keep prices flowing:

- **snapshot-ingest** — cron `*/5 * * * *`. Writes a `market_snapshots` row per
  source (yahoo for all symbols, Finnhub also for US symbols) for every distinct
  symbol in any user's watchlist. Per-symbol failures are logged and skipped;
  a secondary source failing (yahoo still succeeded) is tracked separately as
  `secondaryFailures`, not a hard failure.
- **daily-history-backfill** — cron `30 1 * * *`. Upserts ~45 trading days
  (60 calendar days requested) of daily closes per symbol into `daily_history`
  (Phase 5 volatility/benchmark input).

**Chosen polling interval: 5 minutes.** Staleness bands
(`lib/market-data/staleness.ts`): FRESH <2 min, DELAYED 2–10 min, STALE >10 min.
In steady state the watchlist price reads as DELAYED — that is honest (last
fetch 3–5 min ago), and nothing surfaces the badge until Phase 8.

### Running the jobs in dev

```bash
npm run dev        # terminal 1
npm run inngest    # terminal 2 — inngest-cli dev, dashboard on :8288
```

Trigger on demand without waiting for the cron: while signed in, visit
`http://localhost:3000/api/dev/trigger?job=snapshot` (or `?job=history`) in the
browser, or use the **Invoke** button in the Inngest dashboard at
http://localhost:8288.

No new SQL migration — `market_snapshots` and `daily_history` were created in
Phase 1's `0001_init.sql`.

**Known limitation:** neither `market_snapshots` nor `daily_history` has an
index beyond its primary key, and neither has a retention/pruning job — both
grow without bound as the cron jobs run. The `/watchlist` page bounds its own
read with `.limit()` as a stopgap; a proper fix (a `DISTINCT ON` view/RPC, or
dedicated indexes plus pruning) is deferred past this hackathon phase.

## Phase 7: AI thesis relevance

For any stock that is both flagged (Urgent/Notable, Phase 5) and has a
user-provided thesis, a Gemini call (via Inngest `step.ai.infer`, structured
JSON output) judges whether recent Finnhub news supports, contradicts, or
doesn't clearly affect that thesis — the one AI touchpoint in this product,
kept fully separate from the deterministic score (it never feeds back into
`meaningfulness_score`/`bucket`).

- Triggered from `GET /api/watchlist/diffs` right after Phase 5 scoring, for
  at most 5 highest-scoring eligible stocks per call (`lib/thesis/trigger.ts`)
  — a cost/latency trade-off, not a hidden limit.
- Each Inngest event carries an idempotent id
  (`${userId}:${symbol}:${changeEventId}`), so the client's 5-second poll for
  a pending verdict (`components/watchlist/diff-panel.tsx`) never triggers a
  duplicate model call.
- No news found → the model still runs and returns `no_new_information`
  plainly, rather than the code fabricating a verdict. A broken/missing
  `GEMINI_API_KEY` degrades to `unavailable` — the rest of the digest is
  unaffected.
- Edit an existing thesis from `/watchlist` ("Edit thesis") — past
  `change_events` verdicts stay historically accurate; only future checks see
  the new text.

Verification: `npm run verify:thesis` (pure-logic checks — verdict parsing,
cap/priority selection). Full acceptance criteria and manual testing steps:
`phase7.md`.

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

## Phase 2 acceptance tests

1. Search "Infosys" or "TCS" → relevant results appear.
2. Search "zzxxqq123" → clean empty state, no crash.
3. Add a stock with a thesis → shows in `/watchlist` with the thesis text.
4. Add a stock with no thesis → shows with no thesis line (no "null"/"undefined").
5. Add the same stock twice → clear message, no duplicate row in Supabase.
6. Remove a stock → confirm step, then it's gone from `/watchlist` and the DB.
7. User B's watchlist is empty and independent of User A's.
8. Full reload → watchlist state persists.
9. Break `FINNHUB_API_KEY` → search degrades to the static NSE list with a
   warning; the rest of the app is unaffected.

## Phase 1 acceptance tests

1. Sign up → redirected to `/dashboard`, name shows.
2. Sign out → sign in → session persists, lands on `/dashboard`.
3. Visit `/dashboard` while signed out → redirected to sign-in.
4. `/debug` as User A: insert TEST row, reads back, deletes.
5. User B cannot see or query User A's `watchlist_items` rows (RLS enforced).
6. All five tables exist with correct columns/constraints — check
   `unique(user_id, symbol)` on `watchlist_items` and the composite PK on
   `user_seen_state`.
7. Fresh clone + `.env.local` filled → `npm run dev` boots with no
   missing-config errors.
