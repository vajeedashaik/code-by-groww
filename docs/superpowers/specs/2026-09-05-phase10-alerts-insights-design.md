# Phase 10 — Alerts, Company Insights, Candlestick Charts — Design (retroactive)

Status: retroactive — this doc describes what `ddb65f7` ("Preview-1") already
shipped, written after the fact per `phase10.md` task 1 so this feature set
gets the same documentation discipline as Phases 1-9. Continues Phases 1-9
(`context.md`).

## Why retroactive

`ddb65f7` landed a full visual redesign plus three real features — alerts,
company insights, candlestick charts — in one commit, with no design spec,
plan, or code review at the time. `.env.example` even labels the alerts
section "Phase 10", but no brief backed it. This doc closes that gap; it
does not propose new work (`phase10.md`'s own tasks 2-6 cover the rest of
the gap: a real code-review pass, verification script, `context.md` entry,
perf fix, middleware fix, and pitch-material updates).

## Feature 1: Price/volume threshold alerts

**What it does:** a user attaches one or more alerts to any watchlist
symbol — `price_above`, `price_below`, or `volume_above`, each with a
numeric threshold. A cron evaluates every active alert every 5 minutes
against the latest `market_snapshots` row and emails the owner once per
cooldown window when it fires.

**What it decided:**
- **Schema** (`supabase/migrations/0006_alerts.sql`): a plain `alerts`
  table, RLS-scoped by `user_id` the same way every other user-owned table
  in this app is (`select`/`insert`/`update`/`delete` policies keyed off
  `auth.jwt() ->> 'sub'`) — no new authorization pattern introduced.
- **Actions vs. evaluation are split**: `app/(protected)/watchlist/alert-actions.ts`
  (`createAlert`/`removeAlert`/`toggleAlert`) only validates and persists,
  server-actions style, same shape as the existing watchlist actions. It
  never touches market data. `lib/inngest/functions/alert-check.ts` is the
  only place that reads `market_snapshots` and decides to fire — one
  function owns "is this alert due," nothing duplicates that logic.
- **Pure evaluation logic is factored out**: `isTriggered()` and
  `onCooldown()` live in `lib/alerts/evaluate.ts`, not inline in the
  Inngest function file, so they're importable by `scripts/verify-alerts.ts`
  without dragging in that file's `server-only`/Clerk/Supabase/Inngest
  imports — same "pure lib, thin orchestration wrapper" split already used
  for `lib/market-data/reconcile.ts` and `lib/thesis/trigger.ts`. (This
  split is new as of this phase — see "Deviations" below.)
- **Runs on its own cron tick, not chained onto snapshot-ingest**: Inngest
  doesn't guarantee run order between two functions on the same cron
  expression, so alert-check always reads whatever snapshot is newest *at
  evaluation time* (one cycle behind at worst) rather than depending on
  snapshot-ingest finishing first — a slow/failed snapshot run never blocks
  alert delivery for symbols that already have fresh data.
- **Cooldown, not dedup-by-value**: an alert that stays past its threshold
  doesn't re-fire every 5 minutes; `cooldown_minutes` (default 60,
  `createAlert`-side constant) gates re-triggering. The trigger timestamp is
  recorded regardless of whether the email actually sent — the cooldown
  protects the user's inbox from a choppy stock, it is not a retry
  mechanism for a flaky email provider.
- **Email degrades silently, by design**: `lib/email/resend.ts`'s
  `isEmailConfigured()` gate means a missing `RESEND_API_KEY` logs and
  skips the send rather than failing the whole evaluation — same graceful-
  degradation posture as every other optional external dependency in this
  app (Finnhub, Gemini).

**What it trades off:**
- No custom cooldown control in the UI yet — every alert gets the same
  fixed 60-minute default. `MIN_COOLDOWN_MINUTES` exists as a named
  constant but nothing currently reads user input into `cooldown_minutes`,
  so there's no live enforcement gap today, only a documented one for
  whoever adds that control later (see the code-review section).
- `resolveEmail()`'s primary-email lookup falls back to the account's first
  email address if no primary is set. Reviewed and accepted (see below) —
  not fixed, because there's no reproducible failure mode with this app's
  actual sign-in methods.

## Feature 2: Company insights

**What it does:** `/stocks/[symbol]` shows a US-equities company snapshot —
profile (name/logo/industry/market cap), key metrics (P/E, EPS, 52-week
range, margins, beta), analyst ratings history, and news sentiment — sourced
from Finnhub's free tier.

**What it decided:**
- **`lib/stocks/insights.ts`'s `getCompanyInsights()`** short-circuits NSE
  symbols (`.NS`/`.BO`) before any fetch, with an explicit
  `unavailableReason`, because Finnhub's free tier returns empty/zeroed
  bodies for them rather than a clean 404 — silently rendering that as "real
  (if boring) data" would be dishonest. Same "unavailable is a valid, clearly
  labeled state" posture as the rest of this app's data-quality handling.
- **`cache()` from `react`, not a module-level `Map` or KV store** — this is
  React's per-request server-render memoization, not a persistent or
  cross-request cache. It dedupes redundant calls to the same symbol within
  one render pass (this page currently only calls it once, so the practical
  effect today is zero — it's cheap insurance, not load-bearing). It cannot
  serve one user's insights to another: it holds nothing between requests.
  The data itself is also not user-specific (public Finnhub company data,
  unlike the Supabase calls elsewhere in this app, which are RLS-scoped
  because they hold per-user watchlist state) — reviewed and confirmed safe
  (see code-review section).
- **Every field independently optional** — profile/metrics/ratings/
  sentiment can each be present or absent; the page renders whatever came
  back instead of an all-or-nothing failure, same pattern as staleness/
  conflict handling elsewhere.
- **Components split by concern**, matching the digest's own component
  granularity: `company-header.tsx`, `key-metrics-grid.tsx`,
  `analyst-ratings-chart.tsx`, `sentiment-card.tsx`,
  `insights-unavailable.tsx` — one component per insights section, so a
  missing field degrades one card, not the page.

**What it trades off:**
- US-equities only — the exact same Finnhub free-tier limitation already
  documented for market data elsewhere in this app
  (`lib/market-data/sources/finnhub.ts`). Not a new limitation, the same one
  surfacing in a second feature.
- `fetch`'s `next: { revalidate: 3600 }` means insights can be up to an hour
  stale — acceptable for slow-moving fields like P/E and analyst ratings,
  not attempted for price (which already has its own 5-minute pipeline).

## Feature 3: Candlestick charts

**What it does:** real OHLC candlestick rendering (via `lightweight-charts`)
on both `/watchlist` (inline per-row toggle, open by default — see the
watchlist-page work earlier in this session) and `/stocks/[symbol]` (with a
1M/3M/6M/1Y interval switcher, `components/stocks/interval-chart.tsx`).

**What it decided:**
- **`app/api/stocks/[symbol]/candles/route.ts`** is a thin, auth-gated,
  read-only proxy onto `lib/market-data`'s existing `getCandles` (Yahoo) —
  it never touches `daily_history` or scoring, purely a display-layer
  endpoint. Errors map `MarketDataError`'s `code` to an HTTP status
  (`NOT_FOUND` → 404, `RATE_LIMIT` → 429, else 502) instead of a bare 500.
- **The chart's target `<div>` stays mounted across every state** (loading/
  ready/empty/error render as an overlay on top of it) because
  `createChart()` needs a real, already-laid-out container — conditionally
  rendering the container only once data is ready would deadlock on itself.
- **No fabricated bars**: a symbol with zero chart history renders an honest
  "No chart history for {symbol} yet" empty state, never synthetic data.

**What it trades off (fixed this phase, not a new feature):**
- Every mounted instance added its own unthrottled `window.resize` listener
  — fine for one chart, real cost if a demo opens several toggles at once
  and someone resizes the window. Debounced (~100ms) as part of this
  phase's task 2 perf pass; no chart behavior changed, only the resize
  handler's call frequency.

## Code review (phase10.md task 1, second bullet)

Ran specifically against this feature set, at the same rigor as every
earlier phase's review pass. Four things were called out by name in the
brief; findings below.

1. **`onCooldown()` off-by-one/timezone check** — no bug found.
   `now = Date.now()` and `new Date(last_triggered_at).getTime()` are both
   UTC epoch milliseconds; `timestamptz` round-trips through ISO 8601
   losslessly, so there is no timezone-dependent comparison here at all
   (the "timezone" framing in the brief was itself worth explicitly ruling
   out, not assuming). The boundary is `elapsedMs < cooldown_minutes *
   60_000` — strict less-than, so an alert becomes eligible to re-fire
   again *at* the exact cooldown boundary, not one tick after. Verified by
   `scripts/verify-alerts.ts`'s three boundary cases (1s before, exactly at,
   1s after). No fix needed.

2. **`createAlert`'s `MIN_COOLDOWN_MINUTES * 4` (60min) default — is it
   enforced as a minimum anywhere?** Confirmed: no. `createAlert`'s input
   type (`symbol`, `companyName`, `alertType`, `threshold`) has no
   `cooldownMinutes` field at all today, so the 60-minute value is always
   exactly what gets inserted — there is no live path where a caller can
   currently pass a shorter cooldown, so this is not a bug in the shipped
   code. It is, precisely as the brief frames it, a **documented gap for
   future work**: if a custom-cooldown control is ever added to the UI,
   `MIN_COOLDOWN_MINUTES` needs to actually be enforced as a floor
   (`Math.max(MIN_COOLDOWN_MINUTES, userValue)`) at the point that value is
   read, not just exist as an unused-for-validation constant. Filed as a
   Minor finding, not fixed — inventing a clamp for an input that cannot
   currently be supplied would be validating a scenario that can't happen
   yet, which this project's own conventions treat as premature.

3. **`getCompanyInsights`'s `cache()` — can it ever serve stale insights
   across users?** No. `cache()` from `react` is request-scoped server
   render memoization (dedupes repeat calls within one render pass), not a
   persistent store — nothing survives between requests, so there is no
   mechanism for user A's render to read a value computed during user B's
   render. It also isn't RLS-scoped because it doesn't need to be: the
   underlying data is public Finnhub company data (profile/metrics/ratings/
   sentiment for a ticker), never a per-user value, unlike the Supabase
   calls elsewhere in this app that legitimately need RLS. Confirmed safe,
   no fix needed.

4. **`resolveEmail()`'s fallback to `emailAddresses[0]` — can it silently
   email the wrong address for a multi-email account?** Reviewed, accepted
   as-is (Minor, documented). This app's only sign-in paths (per
   `app/sign-in`, Clerk-hosted) are Clerk's standard email flows, which
   always set a `primaryEmailAddressId` on account creation — the fallback
   path is theoretically reachable only if a user later adds a second email
   and Clerk ever returns a user object with a null/stale
   `primaryEmailAddressId` mid-transition, which hasn't been reproduced and
   isn't a pattern this app's auth flow exercises. The function already
   fails safe on error (catches, logs, returns `null` — no email sent,
   never throws), so the worst case of this specific fallback firing
   incorrectly is "email goes to a secondary address the same account
   holder owns," not a cross-account leak. Left as a documented Minor
   rather than adding unverified defensive code against an unreproduced
   scenario.

**Nothing Important/Critical found** — this feature set was already built
soundly; the value of this pass was making the "why it's safe" reasoning
explicit and durable (in this doc + `scripts/verify-alerts.ts`), not fixing
defects.

## Verification

`scripts/verify-alerts.ts` (`npm run verify:alerts`) — pure-logic checks on
`lib/alerts/evaluate.ts`'s `isTriggered()` (all three alert types, boundary
inclusive) and `onCooldown()` (never-triggered case, and the exact boundary
from both sides). Same `tsx`, no-I/O, explicit pass/fail-count pattern as
`verify-scoring`/`verify-digest`/`verify-thesis`/`verify-reconcile`.

No test runner (jest/vitest) in this repo, same as every prior phase.
Full verification for this phase: `tsc --noEmit`, `next build`, all five
`verify:*` scripts (including the new one), plus `phase10.md`'s own TESTING
list (background feel, middleware redirect, docs accuracy, CI green,
30-50 stock perf numbers) for anything needing a browser, a live account, or
human judgment.

## What this phase does NOT do

- No new alert types, no new insight metrics, no chart indicators — this
  phase documents, reviews, and verifies the existing feature set, per
  `phase10.md`'s explicit scope.
- Does not add a custom-cooldown UI control (that would be the trigger for
  finding 2's enforcement gap to become a real fix, not before).
- Does not add a second email provider, does not touch scoring weights,
  reconciliation tie-break, or the thesis prompt.
