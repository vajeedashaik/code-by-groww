# Smart Market Watchlist

A watchlist that remembers exactly what you last saw, and only interrupts you
again when a stock's move is genuinely meaningful — not just loud. Every
change is scored against the stock's own normal volatility and the broader
market/sector move, so a routine wobble on a choppy stock never crowds out a
quiet move on a calm one that actually matters. Flag a stock with your own
thesis, and one AI check reads recent news to tell you if that thesis still
holds.

**The core insight:** most "market dashboard" products compete on more data,
more charts, more tickers on screen. This one competes on *memory and
attention* — it's the only piece of state a user-facing dashboard usually
throws away between visits ("what did I already see?"), and restoring it is
what turns a wall of numbers into a short, honest "here's what changed."

Built solo in a 72-hour hackathon. Stack: Next.js 15 (App Router) ·
TypeScript · Tailwind CSS v4 · Clerk (auth) · Supabase (Postgres + RLS) ·
Inngest (scheduled jobs) · yahoo-finance2 + Finnhub (market data) · Gemini
(the one AI touchpoint).

## Key decisions (judge-facing)

**Why this architecture, not microservices?** One Next.js app + Supabase +
Inngest. Solo, 72 hours, a handful of scheduled jobs and one request path —
microservices would add deployment/coordination overhead with no benefit at
this scale. Inngest gives the one thing a monolith doesn't have natively
(durable scheduled/background jobs with retries) without standing up
infrastructure.

**Why this meaningfulness algorithm?** A weighted composite of four
volatility-normalized z-scores — price anomaly (0.4), volume anomaly (0.2),
market-relative move (0.2), sector-relative move (0.2) — all divided by the
stock's own 20-day volatility, so "how unusual is this *for this stock*"
drives the ranking, not raw magnitude. Bucketed at `Urgent ≥ 2.0`,
`Notable ≥ 0.8` (`lib/scoring/score.ts`). Verified against two worked
scenarios before shipping: a choppy 5%/day stock riding a broad +5% rally on
a +7% move scores 0.68/Routine, while a calm 1%/day stock with a flat market
and a 4x volume surge on a +3% move scores 2.94/Urgent — confirming the
engine correctly ranks "genuinely independent move" above "large move that's
mostly market noise."

**How staleness/conflicts are handled?** Price freshness is banded — FRESH
(<2 min), DELAYED (2–10 min), STALE (>10 min) — and shown as a badge next to
every price; a STALE reading also forces that change's confidence down to
`Low`, never scored as if it were reliable. When Yahoo and Finnhub disagree
on a US-listed symbol's price by more than 0.1% at roughly the same moment,
neither value is averaged or hidden — both are kept, Yahoo's is used
(documented priority: free, unlimited, covers every symbol tracked including
NSE), and the disagreement is shown in the "why is this flagged?" detail
view. See `lib/market-data/reconcile.ts`.

**Why not custom sector-classification data?** A static 6-sector ×
5-large-cap NSE symbol→sector map (`lib/market-data/sectors.ts`) plus Nifty
50 as the market benchmark, instead of a live sector-classification API. The
trade-off: any symbol outside that hand-picked set gets `sector_used: null`
and degrades gracefully to a market-only comparison (`Medium` confidence,
never a crash) — accepted because building/maintaining a general sector
taxonomy wasn't the interesting problem to solve in 72 hours; the scoring
*math* was.

**Why AI only for thesis-relevance, never the score?** Every other signal —
price/volume anomaly, market/sector relativity, bucket, confidence — is
deterministic and reproducible from raw numbers. Judging whether a news
headline "supports" or "contradicts" a free-text reason a human wrote is a
natural-language reasoning task with no formula, so it's isolated as one
narrow, opt-in-per-stock, cost-capped layer (Gemini via Inngest
`step.ai.infer`, structured JSON output, capped at 5 checks per digest load)
that degrades to `unavailable` on any failure without touching anything
else. The deterministic score is never a function of what the AI says.

**Chosen final numbers:** 5-minute snapshot polling interval
(`*/5 * * * *`); `RECONCILE_TOLERANCE_MS = 60_000`,
`CONFLICT_THRESHOLD_PCT = 0.1`; `SCORE_WEIGHTS = { priceAnomaly: 0.4,
volumeAnomaly: 0.2, marketRelative: 0.2, sectorRelative: 0.2 }`,
`BUCKET_THRESHOLDS = { urgent: 2.0, notable: 0.8 }`.

## Prerequisites

- Node 20+ and npm
- A [Clerk](https://dashboard.clerk.com) account
- A [Supabase](https://supabase.com/dashboard) project
- A free [Finnhub](https://finnhub.io) API key
- A free [Gemini](https://aistudio.google.com/apikey) API key

## Run it locally

1. **Clerk** — create an application, copy the Publishable + Secret key from
   **API Keys**.
2. **Supabase** — create a project, copy the Project URL + anon key +
   service_role key from **Project Settings → API**.
3. **Run the migrations** — in the Supabase SQL Editor, run every file in
   `supabase/migrations/` in order (`0001` → `0005`), or run
   `supabase/schema.sql` once for the same result.
4. **Wire Clerk ↔ Supabase** — Supabase **Authentication → Sign In /
   Providers → Third Party Auth → Add provider → Clerk**, follow the
   "Connect with Supabase" flow, save the Clerk domain it gives you.
5. **Env vars** — `cp .env.example .env.local`, fill every value (Clerk,
   Supabase, `FINNHUB_API_KEY`, `GEMINI_API_KEY`).
6. **Run:**
   ```bash
   npm install
   npm run dev        # terminal 1 — app on :3000
   npm run inngest     # terminal 2 — Inngest dev server + dashboard on :8288
   ```

Open <http://localhost:3000>, sign in, add a stock. Prices/scores populate
once the Inngest snapshot job runs (every 5 minutes on its own, or trigger
it immediately: visit `/api/dev/trigger?job=snapshot` while signed in, or
use the **Invoke** button in the Inngest dashboard).

## Routes

| Path         | Access        | Purpose                                             |
| ------------ | ------------- | -------------------------------------------------- |
| `/`          | public        | Landing page                                        |
| `/sign-in`, `/sign-up` | public | Clerk auth                                    |
| `/dashboard` | authenticated | The digest — "while you were away," Urgent/Notable/Routine |
| `/watchlist` | authenticated | Search + add/remove/edit-thesis, raw table, Market Time Machine |
| `/api/search`| authenticated | Stock search (Finnhub + static NSE fallback)        |
| `/api/watchlist/diffs` | authenticated | Diff + score computation, one batched call |
| `/api/inngest`| internal     | Inngest sync/invoke endpoint (not user-facing)      |
| `/api/dev/trigger` | authenticated, dev-only | Manually fire the snapshot/history job, 404s in production |

Unauthenticated requests to `/dashboard` or `/watchlist` redirect to sign-in
(`middleware.ts`, defense-in-depth re-checked in `(protected)/layout.tsx`).
A route-level error boundary (`app/error.tsx`, `app/global-error.tsx`) keeps
one broken component from white-screening the whole app.

## Scripts

| Command             | What                              |
| -------------------- | --------------------------------- |
| `npm run dev`        | dev server                        |
| `npm run build`      | production build                  |
| `npm run start`      | serve the production build        |
| `npm run typecheck`  | `tsc --noEmit`                     |
| `npm run inngest`    | Inngest dev server (run alongside `npm run dev`) |
| `npm run verify:scoring` | pure-logic checks for `lib/scoring/` |
| `npm run verify:digest`  | pure-logic checks for `lib/digest/`  |
| `npm run verify:thesis`  | pure-logic checks for `lib/thesis/`  |
| `npm run verify:reconcile` | pure-logic checks for `lib/market-data/reconcile.ts` |

No test runner (jest/vitest) is used — verification is `tsc` + `next build`
+ these four pure-logic scripts, plus manual browser testing for anything
that needs a real Clerk session or live market data. Full phase-by-phase
build history, deviations, and code-review findings live in `context.md`;
the original per-phase specs are `phase1.md`–`phase9.md`.

## Known limitations (documented, not hidden)

- **No pruning/indexing on `market_snapshots`/`daily_history`** beyond
  primary keys — both grow unbounded as the cron jobs run; reads bound
  themselves with `.limit()` as a stopgap. A "next steps at scale" answer:
  a `DISTINCT ON` view/RPC plus retention policy, not implemented here.
- **Sector mapping is a static, hand-picked list** (6 sectors × 5 NSE
  large-caps) — see "why not custom sector-classification data" above.
- **Dual-source conflict detection only exists for US-listed symbols** —
  Finnhub's free tier doesn't quote NSE stocks, so reconciliation only
  triggers where both a Yahoo and Finnhub quote exist.
- **Performance at 30–50 stocks** — the diffs API and scoring pipeline are
  built to stay batched (a fixed small number of queries regardless of
  watchlist size, see `lib/watchlist/diff.ts` and
  `lib/scoring/history.ts`), but real load numbers at that scale require a
  live Supabase + market-data run and are recorded separately once measured
  (this needs a real account and API keys, so it's a manual step — see
  `phase9.md` task 3).
