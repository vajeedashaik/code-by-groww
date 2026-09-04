# Project Context — Smart Market Watchlist

Living status doc. Update at the end of each phase.

## Overview

Smart market watchlist web app. 72-hour solo hackathon, 9 phases.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Clerk (auth) · Supabase (Postgres + RLS) · Inngest (scheduled jobs) · yahoo-finance2 + Finnhub (market data).

**Phase plan:** 1 Foundation → 2 Watchlist CRUD → 3 Market Data Pipeline → 4
Seen-State/Diffing → 5 Meaningfulness Engine → 6 Digest UI → 7 Thesis + AI
Relevance → 8–9 (resilience/staleness, …).

## Current state — Phase 7: Personal Thesis + AI Relevance Check (BUILT, pending browser/manual verification)

For any flagged (Urgent/Notable) stock with a user-provided thesis, one
Gemini call (via Inngest `step.ai.infer`, Gemini's native structured JSON
output) judges whether recent Finnhub news supports/contradicts/doesn't
affect the thesis. This is the one place AI touches the product — fully
separate from Phase 5's deterministic score (never merged into
`meaningfulness_score`/`bucket`). Built directly (not via
`subagent-driven-development`'s per-task subagent dispatch — the
fully-specified implementation plan made re-deriving each task via a fresh
subagent redundant; instead implemented directly against the plan, then one
comprehensive `superpowers:code-reviewer` pass against the whole diff at the
end, same as that skill's own final step). Full design:
`docs/superpowers/specs/2026-09-04-phase7-thesis-relevance-design.md`; full
plan: `docs/superpowers/plans/2026-09-04-phase7-thesis-relevance.md`.

### What is built (Phase 7)

| Area | Files |
| --- | --- |
| Types | `lib/thesis/types.ts` — `ThesisVerdictCategory`, `ThesisSignal`, `ThesisAnalysis` (stored shape), `ThesisField` (API/UI shape), `NewsArticle` |
| Defensive parser | `lib/thesis/parse-verdict.ts` — `parseVerdictResponse()`: never throws, any missing/malformed field degrades to `"unavailable"` |
| Cost-control selection | `lib/thesis/trigger.ts` — `selectThesisChecksToRun()`: Urgent/Notable only, non-empty thesis, not yet assessed, score-priority, capped at 5 |
| Prompt + structured output | `lib/thesis/prompt.ts` — `buildThesisPrompt()`: pure builder, uses Gemini's native `responseMimeType: "application/json"` + `responseSchema` rather than prompt-only JSON enforcement |
| News fetch | `lib/news/finnhub-news.ts` — `getCompanyNews()`: Finnhub `/company-news`, last 5 days, capped at 5 articles, returns `[]` (not an error) when nothing found |
| Inngest function | `lib/inngest/functions/thesis-relevance.ts` — `thesisRelevance`, event `thesis/relevance.requested`: re-checks not-already-assessed (belt-and-suspenders alongside the route's own check + Inngest's event-id dedup), fetches news, calls Gemini, parses defensively, persists `thesis_verdict` + `explanation.thesis_analysis`; any error (bad key, quota, timeout) degrades to a stored `"unavailable"` verdict instead of crashing or retrying forever |
| Scoring pipeline fix | `lib/scoring/compute-for-diffs.ts` — rewritten so a `(symbol, snapshot_id)` pair that already has a `change_events` row is read back and reused as-is, **never** recomputed/rewritten (see Critical fix below); `lib/scoring/score.ts` gained an exported `deriveBucket()` so the reuse path can classify a persisted score without re-running `computeMeaningfulness` |
| Wiring | `app/api/watchlist/diffs/route.ts` — selects `thesis`/`company_name`, builds candidates, fires capped/idempotent Inngest events (`id: ${userId}:${symbol}:${changeEventId}`), merges a `thesis` field into each diff; `lib/watchlist/scored-diff.ts` gained the `thesis?: ThesisField \| null` field; `app/api/inngest/route.ts` registers the new function |
| Live update | `components/watchlist/diff-panel.tsx` — polls every 5s (60s safety cutoff) while any thesis is unassessed; a poll merges only the `thesis` field onto the already-rendered diff (see Critical fix below), never re-fires `markWatchlistSeen()` |
| Digest UI | `components/digest/stock-card.tsx` — "Your thesis: …" + status line (Mostly intact/Contradicted/Unclear/No new information/Unavailable/Checking…); `components/digest/why-flagged-detail.tsx` — adds a "Thesis analysis" subsection with per-signal reasoning when present |
| Edit thesis | `components/watchlist/edit-thesis.tsx` (inline expand-to-edit, mirrors `remove-stock-button.tsx`'s pattern) + `updateWatchlistThesis()` server action in `actions.ts` (touches only `watchlist_items`, never `change_events` — past verdicts stay historically accurate) + wired into `app/(protected)/watchlist/page.tsx` |
| Verification script | `scripts/verify-thesis.ts` (`npm run verify:thesis`) — 20 checks: all `parseVerdictResponse` edge cases, all `selectThesisChecksToRun` filter/cap/priority rules, `buildThesisPrompt` shape/content checks |

### Critical fix found by final code review (fixed before declaring done)

A `superpowers:code-reviewer` pass against the whole diff caught a real bug
the design doc's own stated concern (thesis_analysis getting wiped by a
poll) didn't fully cover: `markWatchlistSeen()` advances the seen pointer to
the just-shown snapshot immediately after the first digest fetch. The 5s
thesis-status poll then re-ran the old `computeAndPersistScores`, which saw
`then === current` for that symbol (0% delta), recomputed a near-zero score,
and **upserted over the same `change_events` row** — silently demoting an
Urgent/Notable card to Routine mid-session while the AI verdict was still in
flight, and corrupting the historical detection record with a phantom
zero-delta score. This would have failed phase7.md's own acceptance tests 6
and 9 (which require watching the digest live through the polling window,
not just checking Supabase after the fact).

**Fix:** `computeAndPersistScores` now reads back any existing
`change_events` row for a `(symbol, snapshot_id)` pair and reuses it
untouched — score/bucket/confidence/explanation/thesis state all come
straight from the persisted row, never recomputed. Only a diff whose current
snapshot has genuinely never been scored goes through
`computeMeaningfulness` + upsert. A second, related issue was found during
self-verification of that fix: even with scores no longer corrupted, a
poll's raw `SymbolDiff` price/% fields (from `computeDiffsForUser`, not the
score) still went stale the same way, producing a "0% — no change" price
line sitting above an interpretation sentence still describing the real
move. Fixed by having `diff-panel.tsx`'s poll merge only the `thesis` field
onto the already-rendered diff, leaving price/%/interpretation exactly as
first shown until a genuine page reload re-derives them.

Two Minor findings also fixed: `stock-card.tsx`'s verdict-label lookup
tables were `Record<string, string>` (a future `ThesisVerdictCategory`
change wouldn't fail the build, just silently render blank) — tightened to
`Record<ThesisVerdictCategory | "pending", string>`. All other reviewed
areas (cost-control wiring, idempotency, architectural separation from the
deterministic score, graceful AI-failure degradation, historical
immutability of thesis edits) were verified correct by reading the actual
code, not just trusting the plan's description of it.

### Why AI is used here specifically (pitch answer, phase7.md manual step 4)

Every other signal in this product — price/volume anomaly, market/sector
relativity, bucket/confidence — is deterministic, reproducible, and
explainable from raw numbers (Phase 5). Thesis relevance is fundamentally
different: judging whether a news headline "supports" or "contradicts" a
free-text reason a human wrote is a natural-language reasoning task with no
formula. Rather than let that fuzziness leak into the trustworthy
deterministic engine, it's isolated as one narrow, clearly-labeled,
opt-in-per-stock, cost-capped layer that can degrade to "unavailable"
without taking anything else down — the deterministic score is never a
function of what the AI says, in either direction.

### Phase 7 verification

- `npm run typecheck` — exit 0, no output (re-run clean after all fixes).
- `npm run build` — compiled successfully, 11 routes + middleware, 0 errors.
- `npm run verify:thesis` — all 20 checks pass.
- `npm run verify:scoring` — regression check, all 13 checks still pass.
- `npm run verify:digest` — regression check, all 16 checks still pass.
- **Browser/manual tests — not yet run.** ALL 9 of phase7.md's TESTING items
  and its 4 MANUAL STEPS need a real Clerk session, real
  `GEMINI_API_KEY`/`FINNHUB_API_KEY`, a flagged thesis-bearing stock, and
  Inngest-dashboard log inspection (tests 2 and 9 specifically verify the
  de-dup/cap claims by log count, not just by checking Supabase) — none of
  this is doable headlessly. This is the user's job, same as every prior
  phase. Given the Critical fix above, tests 6 and 9 (watching the digest
  live through the ~5-60s polling window) matter more than usual this phase.

### Phase 7 manual steps outstanding (from phase7.md's "MANUAL STEPS")

- [ ] Confirm `GEMINI_API_KEY` is set and working — test with a trivial
  Inngest AI call first if this integration hasn't been touched before.
- [ ] Write and iterate on the actual prompt (`lib/thesis/prompt.ts`) —
  read several real outputs and judge whether the tone sounds like a sharp
  analyst, not generic AI filler.
- [ ] Watch Gemini API usage/quota while testing, especially triggering it
  repeatedly during development.
- [ ] Have the "why AI is used here" answer ready for demo day (see section
  above — this is the current answer, refine in your own words if needed).

### Phase 7 deviations from spec

1. **Not built via `subagent-driven-development`'s per-task subagent
   dispatch** — the implementation plan already contained complete,
   unambiguous code for all 18 tasks (a deliberate choice at planning time),
   so tasks were implemented directly and verified after each one, with a
   single comprehensive `superpowers:code-reviewer` pass at the end
   (matching that skill's own final step) rather than 54 intermediate
   implementer+spec-review+quality-review dispatches for entirely mechanical
   copy-and-verify work.
2. **`computeAndPersistScores` rewritten beyond the plan's original
   Task 8 design** — the plan's version merged `thesis_analysis` forward
   across re-upserts but still re-computed and re-wrote every scorable diff
   on every call; the final code review caught that this recomputation
   itself was unsafe (see Critical fix above), so the shipped version never
   rewrites an already-scored `(symbol, snapshot_id)` row at all.
3. **`deriveBucket()` extracted from `computeMeaningfulness`** — not in the
   original plan; needed so the reuse-existing-row path can classify a
   persisted score without duplicating the threshold logic.
4. **Client polling merges only the `thesis` field**, not the plan's
   original "replace the whole diffs map each poll" — a fix found during
   self-verification of the backend fix (see Critical fix above).
5. **No new DB migration** — `change_events.thesis_verdict` (Phase 1) and
   `.explanation` jsonb (Phase 1/5) already covered everything Phase 7
   needed to store.
6. **No test runner** — same Phase 2-6 deviation; verification is
   `tsc`/`build`/`verify:thesis`/`verify:scoring`/`verify:digest` scripts.
7. **Executed directly on `master`**, same as every prior phase — treated as
   an established project convention rather than re-confirmed from scratch
   (6 consecutive prior phases already explicitly confirmed this).

## Current state — Phase 6: "While You Were Away" Digest UI (BUILT, pending browser/manual verification)

Replaces `/dashboard`'s Phase 1 placeholder with the digest — the primary
UI surface and the moment the product's core promise (Phase 5's scoring)
becomes visible. `/watchlist` (Phase 2/4's raw table) stays as a secondary
view, two-way linked with `/dashboard`. Built via
`superpowers:subagent-driven-development` — 13 tasks, spec-compliance +
code-quality review each, one real issue found and fixed. Full design:
`docs/superpowers/specs/2026-09-04-phase6-digest-ui-design.md`; full plan:
`docs/superpowers/plans/2026-09-04-phase6-digest-ui.md`.

### What is built (Phase 6)

| Area | Files |
| --- | --- |
| Shared type extraction | `lib/watchlist/scored-diff.ts` — `ScoredDiff` type moved out of `diff-panel.tsx` so digest components can import it without reaching into a client component file |
| Provider hook export | `components/watchlist/diff-panel.tsx` gains `useWatchlistDiffs()` — reads Phase 4's already-fetched diffs Map without a second fetch or any change to the race-verified fetch→setState→markWatchlistSeen ordering (re-verified byte-for-byte in code review) |
| Interpretation engine | `lib/digest/interpret.ts` — `interpretExplanation()`: ordered rule chain (high volume + independent move / high volume + tracked / independent + normal volume / tracked + normal volume / no comparison data), named threshold constants (`HIGH_VOLUME_RATIO=2`, `INDEPENDENT_MOVE_THRESHOLD_PP=1`) for the hand-tuning phase6.md's manual step 2 expects |
| Bucketing + headline | `lib/digest/summarize.ts` — `bucketDiffs()` groups watchlist items into Urgent/Notable/Routine/NewlyAdded; `summaryLine()` produces one of three headline variants (normal/calm/first-visit). Fixed in review: an unbucketed non-first-view diff (upstream contract violation) now logs and falls back to Routine instead of silently vanishing from the digest |
| Verification script | `scripts/verify-digest.ts` (`npm run verify:digest`) — 16 checks against the pure `lib/digest/` functions: all 5 interpretation rules, all 4 bucket categories + the omit-if-no-diff case, all 3 summary headline variants including exact pluralization |
| Digest components | `components/digest/{why-flagged-detail,stock-card,routine-line,newly-added-section,bucket-section,digest-view}.tsx` — full evidence-trail detail (the one place confidence appears), full Urgent/Notable card (price+%-since-last-seen, interpretation, expandable detail), compact Routine line, lightweight first-view list, a single parametrized collapsible-section wrapper using native `<details>` (no custom JS state), and the top-level assembly reading from `useWatchlistDiffs()` |
| Route rewrite | `app/(protected)/dashboard/page.tsx` — Server Component fetching `watchlist_items(symbol, company_name)`, wraps `DigestView` in `WatchlistDiffsProvider`; `app/(protected)/watchlist/page.tsx` gains a small reciprocal "Back to digest" link |

### Bucketing/empty-state logic, precisely

- **Normal**: `urgent.length + notable.length > 0` → "N meaningful changes across M stocks." Urgent/Notable sections open by default (`<details open>`), Routine collapsed.
- **Calm** (zero meaningful changes): `urgent`/`notable` both empty but `routine.length + newlyAdded... ` — specifically, `hasAnyScored` (urgent+notable+routine > 0) is true and `meaningfulCount` is 0 → "Nothing meaningful changed since you last checked." Routine section still renders (collapsed) underneath if non-empty — the calm state is about the headline, not about hiding data.
- **First-visit**: `hasAnyScored` is false (nothing has been scored at all yet) and `newlyAdded.length > 0` → "N stocks added — here's your first look." Only the Newly Added section renders — visually and textually distinct from the calm state, per phase6.md's explicit requirement.
- **Loading/error**: `DigestView` shows "Checking for changes…" while `useWatchlistDiffs().loading` is true, or a red error box if the fetch failed (`diffs === null`) — mirrors `DiffLine`'s existing states.
- **Empty watchlist**: unchanged Phase 2 pattern (dashed-border "nothing yet" box), not a digest-specific concern.

### Phase 6 code review findings

One real issue found and fixed:
- `bucketDiffs` had no `else` branch — a non-first-view diff with an
  unexpected missing `bucket` (an upstream Phase 5 API contract violation)
  would silently vanish from every bucket, invisible in production, for a
  product whose entire thesis is "don't miss something urgent." Fixed:
  logs a `console.error` and falls back to the Routine bucket so the stock
  is never lost, just possibly misclassified with a visible trail.

All other reviews (10 of 12 code tasks) passed clean on the first pass —
no critical/important findings. Two Minor, forward-looking notes not
acted on: (1) `pctColor`/`pctLabel` formatting logic is duplicated across
`DiffLine`, `StockCard`, and `RoutineLine` (a plan-level choice, not an
implementation gap — worth extracting to a shared helper in a later
polish pass); (2) `BucketSection`'s `defaultOpen` prop is safe only
because both call sites pass static literals, not computed values — noted
as a maintenance footgun for whoever touches `digest-view.tsx` next.

### Phase 6 verification

- `npm run typecheck` — exit 0, no output.
- `npm run build` — compiled successfully, 11 routes + middleware, 0
  errors. `/dashboard` now a genuine dynamic (ƒ) route (3.16 kB) instead
  of the Phase 1 placeholder.
- `npm run verify:digest` — all 16 checks pass.
- `npm run verify:scoring` — re-run as a regression check, all 13 checks
  still pass (confirms Phase 6 didn't touch `lib/scoring/`).
- **Browser/manual tests — not yet run.** ALL 8 of phase6.md's TESTING
  items require a browser, a real Clerk session, a populated multi-symbol
  watchlist, a mobile-width resize, and (test 8) a "cold read" from
  someone unfamiliar with the project — none of these can be done
  headlessly. This is the user's job, same as every prior phase.

### Phase 6 manual steps outstanding (from phase6.md's "MANUAL STEPS")

- [ ] Look at the digest with real test data and judge honestly: does it
  feel calm and useful, or still like a noisy dashboard? **Specifically
  check the color question flagged in Phase 6's final holistic review**:
  `StockCard`, `RoutineLine`, and `BucketSection` each independently reuse
  `DiffLine`'s green/red price-direction coloring plus their own
  red-700/amber-700 header tones, so a mixed watchlist may render 4+ hue
  families at once — possibly recreating the "red/green anxiety-inducing
  ticker" phase6.md explicitly warned against, especially since Routine
  rows (meant to carry less visual weight) still get full-saturation
  green/red. If it feels noisy, consider muting Routine's price color to
  gray and/or softening the bucket-header tones so color reads as a single
  intentional signal, not competing alarms.
- [ ] Manually tune `lib/digest/interpret.ts`'s template rules against a
  handful of real `change_events` — read them out loud, rewrite anything
  that doesn't sound like a sharp human analyst.
- [ ] Decide final empty/calm-state copy (currently "Nothing meaningful
  changed since you last checked." / "N stocks added — here's your first
  look.") — small wording choices here matter more than they seem.
- [ ] Take screenshots once it looks good, for the pitch deck.

### Phase 6 deviations from spec

1. **No test runner** — same Phase 2-5 deviation; verification is
   `tsc`/`build`/`verify:digest`/`verify:scoring` scripts, not jest/vitest.
2. **`ScoredDiff` type extracted to its own file** (`lib/watchlist/scored-diff.ts`)
   rather than left inline in `diff-panel.tsx` — not explicitly called out
   in phase6.md, but necessary so `lib/digest/` (pure, non-React code)
   doesn't import from a `"use client"` component file.
3. **Executed directly on `master`**, same as every prior phase — user
   explicitly re-confirmed continuing the established convention rather
   than a worktree/branch.
4. **README.md's route table entry for `/dashboard` updated** alongside
   this phase's context.md update — it still described the Phase 1
   placeholder ("Welcome, {name}"), caught during Task 11's code review.

## Current state — Phase 5: Meaningfulness Engine (BUILT, pending browser/manual verification)

Converts Phase 4's raw price/volume diff into a volatility-normalized,
market/sector-relative meaningfulness score (Urgent/Notable/Routine bucket +
Low/Medium/High confidence + structured explanation), persisted to
`change_events` and exposed through the existing diffs API. Built via
`superpowers:subagent-driven-development` — fresh implementer subagent per
task, spec-compliance review, then code-quality review, for all 12 tasks in
`docs/superpowers/plans/2026-09-04-phase5-meaningfulness-engine.md` (full
design rationale in `docs/superpowers/specs/2026-09-04-phase5-meaningfulness-engine-design.md`).

### What is built (Phase 5)

| Area | Files |
| --- | --- |
| Sector reference data | `lib/market-data/sectors.ts` — static symbol→sector map (6 sectors × 5 NSE large-caps), `^NSEI` Nifty benchmark, `lookupSector`/`symbolsInSector` helpers |
| Reference-symbol wiring | `lib/inngest/functions/shared.ts`'s `loadWatchlistSymbols()` unions the user-watchlisted symbols with the fixed reference set, so the existing Phase 3 Inngest jobs fetch/store Nifty + sector stocks with zero changes to the job files themselves |
| Pure math | `lib/scoring/volatility.ts` (`computeVolatilityPct` — 20-day std dev of daily returns, null below threshold; `computeAverageVolume`), `lib/scoring/benchmarks.ts` (`computeDailyMovePct`, `computeSectorBenchmarkPct` — latest-vs-prior-close) |
| Scoring | `lib/scoring/score.ts` — `computeMeaningfulness()`: shared-denominator z-scores (`priceZScore`/`marketRelativeZScore`/`sectorRelativeZScore` all divide by the stock's own `dailyVolPct`), named `SCORE_WEIGHTS`/`BUCKET_THRESHOLDS` constants, `Bucket`/`Confidence`/`DataCompleteness`/`Explanation` types. Throws on non-finite numeric input (added during review — a silent NaN would otherwise misclassify as "Routine", the worst failure mode for a signal-surfacing engine) |
| Batched history loader | `lib/scoring/history.ts` — `loadRecentHistory()`: one bounded query across all needed symbols (scored + market benchmark + sector members), grouped/capped/reversed in JS — same accepted pattern as Phase 3/4's `.limit(symbols.length * N)` queries. 3x safety-margin + deterministic secondary sort added during review (see Known limitation below) |
| Orchestration | `lib/scoring/compute-for-diffs.ts` — `computeAndPersistScores()`: batches history loading once, memoizes sector benchmarks per unique sector (not per diff), scores every non-first-view diff, upserts `change_events` on `(user_id, symbol, snapshot_id)`. Per-diff work wrapped in try/catch (added during review) so one bad symbol never aborts the whole batch — mirrors the Inngest jobs' "log and skip, never fatal" contract |
| Migration | `supabase/migrations/0004_change_events_snapshot_dedup.sql` — adds `snapshot_id uuid references market_snapshots(id)` (idempotent `add column if not exists`) + `unique(user_id, symbol, snapshot_id)`; `types/database.ts` and `supabase/schema.sql` updated to match |
| Wiring | `lib/watchlist/diff.ts`'s `SymbolDiff` gained `currentSnapshotId` (sourced from the already-fetched `current` snapshot, no new query); `app/api/watchlist/diffs/route.ts` calls `computeAndPersistScores` and merges `{score, bucket, confidence, explanation}` into non-first-view diffs; `components/watchlist/diff-panel.tsx`'s `DiffLine` renders `[Bucket, score X.XX, Confidence confidence]` as plain colored text — no digest UI polish (that's Phase 6) |
| Verification script | `scripts/verify-scoring.ts` (run via `npm run verify:scoring`, needs new `tsx` devDependency) — exercises phase5.md's acceptance tests 1-4 against the pure functions: scenario (a)/(b) relative ranking, <20-day fallback, unmapped-sector fallback, zero-volume handling. All 13 checks pass |

### Weights and thresholds chosen (initial, per phase5.md's own "don't over-tune" instruction)

`SCORE_WEIGHTS = { priceAnomaly: 0.4, volumeAnomaly: 0.2, marketRelative: 0.2, sectorRelative: 0.2 }`.
`BUCKET_THRESHOLDS = { urgent: 2.0, notable: 0.8 }`. Verified against phase5.md's
own worked scenarios: a choppy stock (5%/day normal volatility) riding a
broad +5% rally with a +7% move scores 0.68/Routine; a calm stock (1%/day
normal volatility) with a flat market and a 4x volume surge on a +3% move
scores 2.94/Urgent — confirming the core insight (shared-volatility-
denominator z-scores) correctly ranks "genuinely independent move" above
"large move that's mostly market noise," not just raw magnitude. Manual
step 2/3 of phase5.md (re-tuning against real multi-day data) is still the
user's job — these are the documented starting values, not a final
calibration.

### Known limitation: `loadRecentHistory`'s shared-LIMIT trade-off

Flagged in code review: the batched history query uses one global
`ORDER BY date DESC LIMIT symbols.length * perSymbolLimit * 3` rather than a
true per-symbol partition (which would need an RPC/view). If symbols have
very uneven date coverage, a symbol could in principle get starved below its
full `perSymbolLimit` rows even though more exist in the table — pushing it
from "20+ rows, volatility available" to "under 20, Low confidence" with no
error logged. Mitigated (not eliminated) with a 3x safety margin and a
deterministic secondary sort. Accepted as proportionate for this project's
data volume (Phase 3's backfill keeps each symbol's history bounded); a true
fix would need a `row_number() over (partition by symbol ...)` query.

### `change_events` explanation shape (what Phase 6 will render)

```json
{
  "price_change_pct": number,
  "price_zscore": number,
  "volume_ratio": number | null,
  "market_change_pct": number | null,
  "sector_change_pct": number | null,
  "sector_used": string | null,
  "data_completeness": "full" | "no_sector" | "no_volume" | "no_sector_no_volume" | "no_volatility" | "no_volatility_no_sector" | "no_volatility_no_volume" | "no_volatility_no_sector_no_volume"
}
```

`data_completeness` was widened from the original design's 4 values to these
8 during code review, so it's derived from the same three factors
(volatility/sector/volume availability) as `confidence` and the two can
never disagree (previously, missing-volume-only cases could read
`"full"` next to a `"Medium"` confidence — a real inconsistency, fixed
before anything downstream could depend on it).

### Phase 5 code review findings (all fixed before moving on)

Two-stage review (spec compliance, then code quality) per task, 12 tasks.
Real, fixed issues:
- Migration's `add column` wasn't idempotent (0003 precedent uses
  `if not exists`) — fixed.
- `computeMeaningfulness`'s `data_completeness` didn't account for missing
  volume, disagreeing with `confidence` — fixed (shared derivation).
- `computeMeaningfulness` had no guard against non-finite input, so a NaN
  would silently produce `bucket: "Routine"` instead of surfacing a bug —
  fixed (throws now).
- `loadRecentHistory`'s shared global LIMIT could silently starve one
  symbol's rows under uneven coverage — mitigated (see Known limitation
  above).
- `computeAndPersistScores` had no per-diff error isolation, so one bad
  symbol would abort the whole batch (and, once wired into the live route,
  the whole `/api/watchlist/diffs` response) — fixed (try/catch + log +
  continue, matching the Inngest jobs' partial-failure contract).

### Phase 5 verification

- `npm run typecheck` (`tsc --noEmit`) — exit 0, no output.
- `npm run build` (`next build`) — compiled successfully, 11 routes +
  middleware, 0 errors. `/api/watchlist/diffs` still listed as dynamic (ƒ).
- `npm run verify:scoring` (new `tsx`-based script, no jest/vitest in this
  repo — same Phase 2-4 precedent) — all 13 checks pass, including the
  scenario (a)/(b) relative-ranking test from phase5.md's acceptance
  criteria 1-4.
- **Browser/manual tests — not yet run.** phase5.md's acceptance tests 5-8
  (inspecting real `change_events` rows in Supabase, confirming the diffs
  API's live response shape, timing a 10+-stock watchlist, and sanity-
  checking real scored examples against intuition) need a real Clerk
  session + real multi-day market data and are the user's job, same as
  every prior phase's browser tests.

### Phase 5 manual steps outstanding (from phase5.md's "MANUAL STEPS")

- [ ] Review/adjust the sector mapping in `lib/market-data/sectors.ts` to
  match your actual demo watchlist's stocks.
- [ ] Once real scores are flowing, manually sanity-check several real
  examples across a few days of data against your own judgment; adjust
  `SCORE_WEIGHTS`/`BUCKET_THRESHOLDS` (both in `lib/scoring/score.ts`) based
  on what you observe, not just theory.
- [ ] Decide final bucket thresholds after seeing real score distributions;
  write down what you chose and why for the pitch's "why this algorithm"
  answer.
- [ ] Watch for a real news-driven move in your test watchlist during the
  build window to use as a genuine demo example.

### Phase 5 deviations from spec

1. **`tsx` added as a devDependency** — not in the original plan; needed to
   run `scripts/verify-scoring.ts` standalone (no jest/vitest in this repo).
   Confirmed during implementation that `tsx` does NOT apply `tsconfig.json`
   path aliases outside Next's bundler, so the verification script uses
   relative imports (`../lib/scoring/score`) instead of `@/lib/scoring/score`.
2. **`DataCompleteness` expanded from 4 to 8 values** (see explanation-shape
   section above) — a code-review fix, not a plan deviation exactly, but a
   change to the field's contract from what the original design doc
   specified.
3. **`computeMeaningfulness` throws on non-finite input** — not in the
   original design; added during code review as a deliberate "fail loud,
   don't silently misclassify" guard.
4. **`explanation: result.explanation as unknown as Json` cast** in
   `lib/scoring/compute-for-diffs.ts` — a hand-written TypeScript `interface`
   isn't structurally assignable to the generated `Json` index-signature
   type without a cast (verified as a real TS limitation, not a workaround
   for a bug); the underlying data is genuinely JSON-safe.
5. **`loadRecentHistory`'s query widened to a 3x safety margin + secondary
   sort**, not the plan's original 1x margin — a code-review fix for the
   shared-LIMIT starvation risk described above.
6. **No test runner** — same Phase 2-4 deviation; verification is
   `tsc`/`build`/`verify:scoring` script, not jest/vitest.
7. **Executed directly on `master`**, same as every prior phase — user was
   asked explicitly (per `subagent-driven-development`'s "never start on
   master without consent" rule) and confirmed continuing the established
   convention rather than using a worktree/branch.

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

One narrower, undocumented-until-now edge case (flagged in code review):
two near-simultaneous `markWatchlistSeen()` calls (double-mount effect, two
tabs open) each independently re-query "latest now" and then upsert — if the
call that read the *older* snapshot happens to finish its upsert *after* the
call that read the newer one, the final row regresses to the older snapshot
even though the newer one was already marked seen. Low-impact for a
single-tab hackathon UI; not fixed in Phase 4, noted for awareness.

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

### Code review (Phase 4)

Dispatched a `superpowers:code-reviewer` subagent against the diff
(`d3c02f9`→`eaf4ca8`) before declaring Phase 4 done, checking it against
phase4.md's 6 core acceptance criteria plus general code quality.

**Result:** race-condition policy and N+1-avoidance both verified as
correctly implemented (not just documented as correct) — the reviewer
independently confirmed no code path passes a client-supplied snapshot id
into a write, and `computeDiffsForUser` issues exactly 3 queries regardless
of watchlist size. UI sequencing (diff shown before mark-as-seen fires) was
independently traced through `WatchlistDiffsProvider`'s effect and confirmed
correct. Removed-item leak prevention confirmed.

One **Important** finding, fixed immediately (commit `78ff2d9`): 4 Supabase
query error results were silently discarded across `markWatchlistSeen()`
and `computeDiffsForUser()` — `{ data } = await supabase...` with no `error`
check, inconsistent with this file's own `addWatchlistItem`/
`removeWatchlistItem` precedent and with `page.tsx`'s `console.error`
convention. A genuine query failure would have been mislabelled as success
(`markWatchlistSeen`) or as first-view for every symbol
(`computeDiffsForUser`) — the latter is worse than silent, since it produces
a confidently wrong result rather than an obviously broken one. Fixed by
checking and logging (`console.error`) all 4, and returning `{ ok: false }`
from `markWatchlistSeen` on a genuine query failure instead of falling
through.

One **Minor** finding, documented not fixed (see the race-condition section
above): a narrower overlapping-upsert case between two near-simultaneous
`markWatchlistSeen()` calls. Two other Minor notes (market_snapshots queried
twice per page load — once server-side for price, once client-side for
diffs; the inherited `.limit(symbols.length * 10)` truncation assumption
from Phase 3) were judged out of scope for this phase.

### Phase 4 verification

- `npx tsc --noEmit` — exit 0, no output (re-run clean after the code-review
  fix commit too).
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
4. **Supabase query errors added after initial implementation, not in the
   original plan** — code review caught 4 silently-discarded `error` results
   in `markWatchlistSeen`/`computeDiffsForUser`; fixed post-review in commit
   `78ff2d9` to log and (for `markWatchlistSeen`) fail loudly instead of
   falling through to a misleading success/first-view result.

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
25 commits from Phase 1 through Phase 4, oldest first:

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
- `d3c02f9` chore: add server-only guard to both inngest job files
- `4e4c33f` docs: context.md — final Phase 3 review notes + full commit log
- `a074f04` docs: Phase 4 implementation plan + phase4 brief
- `cf1751b` feat: Phase 4 seen-state tracking + raw diff computation
- `eaf4ca8` docs: Phase 4 context update — what's built, race policy, manual tests outstanding
- `78ff2d9` fix: log/surface Supabase query errors in markWatchlistSeen + computeDiffsForUser
- `fe0ee02` docs: note overlapping-write edge case from code review (HEAD)

(Phase 3 design/plan docs were written and committed before Phase 2's own
code was committed — the design/plan work happened first in the session,
Phase 2 code landed right after. Order above is chronological by commit,
not by phase number.)

`node_modules/`, `.next/`, `.env*.local` are gitignored. `phase2.md` was
committed with the scaffold by accident — harmless. `phase3.md` and
`phase4.md` are tracked (committed alongside their phases' work).
`phase5.md`, `phase6.md`, and `phase7.md` (phase briefs dropped in by the
user) currently sit **untracked** in the working tree. Phase 5's and
Phase 6's design/plan docs live in `docs/superpowers/specs/` and
`docs/superpowers/plans/` (2026-09-04-dated files for each).

16 more commits landed for Phase 5 (migration + sectors + pure scoring math
+ orchestration + wiring + review-fix commits), oldest first, after
`fe0ee02`: `a6c302e`, `4dc7cc6`, `8a8942d`, `9f9e8bb`, `89f2fba`, `86482ff`,
`947f583`, `cfce083`, `fa4a356`, `b22ca37`, `1a2cf09`, `76d23a1`, `9085fe9`,
`4a2e3a0`, `d144398`, `f20ada3`. Then 15 more for Phase 6 (spec/plan docs +
hook export + pure lib/digest modules + verification script + component
tree + route rewrite), oldest first, after `7ed5c5f`: `c7b3a9f`, `2314845`,
`3646fb7`, `aea8362`, `3965683`, `d7c36ef`, `d0cbf83`, `7412c82`, `7875b11`,
`5c4cf7e`, `3814d7c`, `ce580f9`, `bb69ccf`, `27ba17a`, `612c40d`, plus a
final holistic-review doc/log-message fix commit.

Then 22 commits for Phase 7 (design/plan docs + `lib/thesis`/`lib/news`
pure modules + verification script + `compute-for-diffs.ts` rewrite +
Inngest function + route/UI wiring + edit-thesis + two post-review fix
commits), oldest first, after `4ce2157`: `0f9c5c3`, `4d9a8c5`, `af985b0`,
`4a5a06b`, `9894b2a`, `d9169cd`, `5258db8`, `bcd253c`, `981baf5`, `ddba73f`,
`3cfbc1e`, `0f4f1eb`, `bcae533`, `6dbba11`, `07ea132`, `d05f873`, `f99c752`,
`101d8a5`, `73889ad`, `7955c57`, `5300736`, `1eb1532` — see the Phase 7
section above for what each does; full messages via
`git log --oneline fe0ee02..HEAD`.

## How to continue

- Local run: fill `.env.local` (now incl. `FINNHUB_API_KEY`), run migrations
  `0001`→`0004`, `npm install`, `npm run dev` + `npm run inngest`, open
  `http://localhost:3000`.
- Phase 3 built, compiling, and backend-smoke-tested (see the Phase 3 section
  above). Run the README "Phase 3 acceptance tests" in a browser — especially
  #2, #5, #6, and the full unattended #8.
- Phase 4 built and compiling (see the Phase 4 section above) — seen-state
  tracking + raw diffing, `GET /api/watchlist/diffs`, diff shown on
  `/watchlist` before mark-as-seen fires. Run phase4.md's 8-item TESTING list
  in a browser (needs manual Inngest-dashboard triggers for the
  race-condition scenarios).
- Phase 5 built, typechecking, building, and scoring-verified (see the
  Phase 5 section above) — meaningfulness scoring wired into
  `GET /api/watchlist/diffs`, `change_events` persisted with snapshot-based
  dedup, `DiffLine` shows `[Bucket, score, Confidence]` as plain text. Run
  migration `0004` in Supabase, then phase5.md's 8-item TESTING list in a
  browser (tests 5-8 need real multi-day data + a Clerk session).
- Phase 6 built, typechecking, building, and digest-verified (see the
  Phase 6 section above) — `/dashboard` is now the "While You Were Away"
  digest (Urgent/Notable/Routine buckets, plain-language interpretations,
  why-flagged detail), `/watchlist` kept as a secondary raw-table view.
  Run ALL 8 of phase6.md's TESTING items in a browser (none can be done
  headlessly — mixed-bucket data, the zero-change and first-visit states,
  15+ stocks, mobile width, and a cold-read comprehension check) and its
  4 manual steps (judging calm-vs-noisy feel, hand-tuning the
  interpretation templates, finalizing empty-state copy, screenshots).
- Phase 7 built, typechecking, building, and thesis-verified (see the
  Phase 7 section above) — flagged + thesis-bearing stocks get one Gemini
  call judging thesis relevance, shown on the digest card with a "Checking
  against your thesis…" live-updating state; `/watchlist` gained an inline
  thesis editor. A real bug (score/bucket corruption from re-scoring an
  already-scored snapshot during polling) was caught by final code review
  and fixed — see that section's "Critical fix" writeup before assuming
  the polling behavior is simple. Run ALL 9 of phase7.md's TESTING items
  in a browser (needs real `GEMINI_API_KEY`/`FINNHUB_API_KEY`, a flagged
  thesis-bearing stock, and Inngest-dashboard log inspection for tests 2
  and 9) and its 4 manual steps (confirming the Gemini key works,
  iterating on the actual prompt wording, watching API quota, finalizing
  the "why AI here" pitch answer) before starting Phase 8 (Resilience —
  staleness, conflicting sources, confidence).
