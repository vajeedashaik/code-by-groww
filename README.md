<img width="825" height="407" alt="image" src="https://github.com/user-attachments/assets/66cfd0ae-7bef-44d7-ae73-4477ab35bd69" />




# Groww Pulse

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

**How does state persist across sessions/devices?** Everything lives in
Supabase, keyed by Clerk `user_id`, RLS-enforced on every table — watchlist
items, seen-state, alerts, thesis text. There is zero `localStorage`/
`sessionStorage` anywhere in the client code (confirmed by grep) — sign in
on a different device and the watchlist, digest history, and alerts are all
already there, because none of it was ever tied to the browser.

**Are the alerts real, or a UI stub?** Real: a threshold (price above/below,
volume above) plus a cooldown, evaluated every 5 minutes by an Inngest cron
against live `market_snapshots` data, delivered by email via Resend on
trigger. This is explicitly the kind of feature `base_guide.md`'s reference
analysis flags as commonly left unbuilt in projects like this — see
`docs/superpowers/specs/2026-09-05-phase10-alerts-insights-design.md` for the
full design writeup and code-review pass.

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
| `/watchlist` | authenticated | Search + add/remove/edit-thesis, raw table, per-stock candlestick chart, price/volume alerts, Market Time Machine |
| `/stocks/[symbol]` | authenticated | Company insights (profile, key metrics, analyst ratings, news sentiment — US equities only, Finnhub) + full candlestick chart with a 1M/3M/6M/1Y interval switcher |
| `/api/search`| authenticated | Stock search (Finnhub + static NSE fallback)        |
| `/api/watchlist/diffs` | authenticated | Diff + score computation, one batched call |
| `/api/stocks/[symbol]/candles` | authenticated | OHLC bars for the candlestick charts (Yahoo, read-only) |
| `/api/inngest`| internal     | Inngest sync/invoke endpoint (not user-facing)      |
| `/api/dev/trigger` | authenticated, dev-only | Manually fire the snapshot/history job, 404s in production |

**Alerts** aren't a separate route — they're inline on `/watchlist`: a
threshold (price above/below, or volume above) evaluated every 5 minutes by
`lib/inngest/functions/alert-check.ts` against `market_snapshots`, emailed
via Resend on trigger (cooldown-gated, degrades to "logged, not emailed"
without a `RESEND_API_KEY`). Real threshold + cooldown + email delivery, not
a UI stub — see `docs/superpowers/specs/2026-09-05-phase10-alerts-insights-design.md`.

Unauthenticated requests to `/dashboard`, `/watchlist`, or `/stocks/[symbol]`
redirect to sign-in (`middleware.ts`, defense-in-depth re-checked in
`(protected)/layout.tsx`).
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
| `npm run verify:alerts` | pure-logic checks for `lib/alerts/evaluate.ts` (alert-check's trigger/cooldown logic) |

No test runner (jest/vitest) is used — verification is `tsc` + `next build`
+ these five pure-logic scripts, plus manual browser testing for anything
that needs a real Clerk session or live market data. All five run on every
push/PR via `.github/workflows/ci.yml`. Full phase-by-phase build history,
deviations, and code-review findings live in `context.md`; the original
per-phase specs are `phase1.md`–`phase10.md`.

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
- **Performance at 30–50 stocks — still not measured.** The diffs API and
  scoring pipeline are built to stay batched (a fixed small number of
  queries regardless of watchlist size, see `lib/watchlist/diff.ts` and
  `lib/scoring/history.ts`), and this has been re-confirmed at the code
  level twice (`phase9.md` task 3, `phase10.md` task 6) — but the actual
  load-time/Network-tab/rate-limit numbers at that scale require a live
  30-50-stock Supabase account and haven't been run yet. This is the one
  outstanding manual step before submission (needs a real account and API
  keys, so it can't be done headlessly) — see `phase10.md`'s MANUAL STEPS.
- **Alert cooldown has no enforced minimum, because there's no way to set
  a custom one yet.** Every alert gets a fixed 60-minute cooldown
  (`createAlert`); `MIN_COOLDOWN_MINUTES` exists as a named constant but
  isn't wired up as a floor because no UI control passes a variable value
  in today. Documented (not fixed) in the Phase 10 code review — see
  `docs/superpowers/specs/2026-09-05-phase10-alerts-insights-design.md`.
