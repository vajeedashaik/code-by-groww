# Project Context — Smart Market Watchlist

Living status doc. Update at the end of each phase.

## Overview

Smart market watchlist web app. 72-hour solo hackathon, 10 phases.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Clerk (auth) · Supabase (Postgres + RLS) · Inngest (scheduled jobs) · yahoo-finance2 + Finnhub (market data).

**Phase plan:** 1 Foundation → 2 Watchlist CRUD → 3 Market Data Pipeline → 4
Seen-State/Diffing → 5 Meaningfulness Engine → 6 Digest UI → 7 Thesis + AI
Relevance → 8 Staleness/Conflict Handling + Time Machine → 9 Polish + Demo
Prep → 10 Retroactive Alerts/Insights Documentation + Hardening.

## Current state — Phase 10: Retroactive Documentation, Review & Hardening (CODE-LEVEL WORK DONE, pending browser/perf/CI-push/rehearsal — the last phase)

Closes a real gap: `ddb65f7` ("Preview-1") landed a full visual redesign
plus three genuinely new, working features — price/volume email alerts,
company insights (`/stocks/[symbol]`), and real candlestick charts — in one
commit, with none of the design-doc/plan/code-review discipline every
earlier phase got. Built directly against a fully-specified `phase10.md`
(same approach as Phases 6-9: the brief already named exact files and exact
problems from an external audit, so tasks were executed directly rather
than via subagent dispatch — this session's context already spanned the
whole codebase from prior work in it, so a fresh-subagent-per-task split
would have mostly re-derived context already held, not added rigor).
No new product scope, per `phase10.md`'s own explicit rule.

### What was done (Phase 10)

| Area | What |
| --- | --- |
| Retroactive design doc | `docs/superpowers/specs/2026-09-05-phase10-alerts-insights-design.md` — what alerts/insights/candlestick charts actually do, decided, and trade off, written after the fact to match every earlier phase's documentation bar |
| Code review | Ran against the four specific concerns `phase10.md` named: `onCooldown()` off-by-one/timezone (no bug — both sides of the comparison are UTC epoch ms, boundary is intentionally inclusive), `createAlert`'s 60-min default as an unenforced "minimum" (confirmed gap, but unreachable today — no UI passes a custom cooldown yet; documented, not fixed, per this project's "don't validate scenarios that can't happen" convention), `getCompanyInsights`'s `cache()` cross-user risk (none — React's `cache()` is request-scoped memoization, not a persistent store, and the underlying Finnhub data isn't user-specific anyway), `resolveEmail()`'s multi-email fallback (theoretical, unreproduced with this app's actual Clerk sign-in flows, fails safe on error). Full writeup in the design doc above. **Nothing Important/Critical found** |
| Pure-logic extraction | `lib/alerts/evaluate.ts` (new) — `isTriggered()`/`onCooldown()` moved out of `lib/inngest/functions/alert-check.ts` into a dependency-free pure module, mirroring `lib/market-data/reconcile.ts`'s and `lib/thesis/trigger.ts`'s existing "pure lib, thin orchestration wrapper" split. Required, not cosmetic — `alert-check.ts` imports `server-only` plus Clerk/Supabase/Inngest, so its logic was not importable by a standalone script without this split; discovered when `scripts/verify-alerts.ts` first failed to import it |
| `scripts/verify-alerts.ts` (new) | `npm run verify:alerts` — 14 checks: `isTriggered()`'s three alert types (boundary-inclusive `>=`/`<=` for price, plus the `volume === null` never-triggers case), `onCooldown()`'s boundary (1s before/at/1s after the cooldown window, plus the never-triggered-before case). Same `tsx`, no-I/O, pass/fail-count pattern as the other four `verify:*` scripts |
| `context.md` (this file) | This section — closes the "silent after Phase 9" gap the brief called out |
| Backdrop/dot-grid perf fix | **Already done before this phase started** — `git log` shows it landed in a separate commit (`1697719`, "perf: replace per-dot Framer Motion nodes with static SVG pattern fill") sometime after Phase 9 but before this session picked up `phase10.md`. Verified against the brief's own description: `components/magicui/dot-pattern.tsx` already renders the grid as one tiled SVG `<pattern>` fill plus a fixed `TWINKLE_COUNT = 20` subset animated via a real CSS `@keyframes dot-twinkle` (`app/globals.css`), not per-dot Framer Motion; `components/ui/backdrop.tsx`'s two ambient blobs are already pure CSS `animate-float` at `blur-[100px]` (already trimmed from the brief's cited 140px). No further change needed here |
| Candlestick chart resize debounce | `components/charts/candlestick-chart.tsx` — the one part of task 2 not already done. Its `window.resize` listener now debounces 100ms (`setTimeout`/`clearTimeout`, cleared on unmount) before calling `chart.applyOptions()`, so multiple chart instances open at once do bounded work per resize instead of one `applyOptions` call per instance per resize event |
| Middleware matcher fix | `middleware.ts` — added `/stocks(.*)` to `isProtectedRoute` alongside the existing `/dashboard(.*)`/`/watchlist(.*)`, so the "defense in depth" comment in `(protected)/layout.tsx` is now actually true for all three protected routes, not two. `(protected)/layout.tsx`'s `auth.protect()` was already the real gate — this closes a doc/code inconsistency, not a live hole |
| README updates | Routes table gains `/stocks/[symbol]` and `/api/stocks/[symbol]/candles`, plus a note that alerts are inline on `/watchlist`, not a separate route. Key decisions gains two new entries: state-persistence (Supabase + Clerk `user_id` + RLS, zero `localStorage`/`sessionStorage` — confirmed by grep) and alerts-are-real (threshold + cooldown + email, not a stub). Known limitations' 30-50-stock line reworded to be explicit that it's still unmeasured (task 6 is a live-account manual step, not something this session could run headlessly), plus a new line on the alert-cooldown-minimum gap from the code review |
| `DEMO_SCRIPT.md` updates | Added a new, deliberate ~25s beat (section 6, "Alerts & company insights") between Thesis and Reliability — chosen over silently scoping them out because both features are real, working, and relevant to "Product & Problem Interpretation" judging, per `phase10.md`'s own steer. Timing table and total updated (~4m15s → ~4m40s); the "cut this first if short on time" guidance now points at the new section first, Reliability second. **This is a default choice, not a locked-in one** — see deviations below |
| CI workflow (new) | `.github/workflows/ci.yml` — runs on every push/PR to `main`/`master`: `npm ci`, `typecheck`, `build`, all five `verify:*` scripts. Build step uses placeholder Clerk/Supabase env values (never real credentials), not just to skip a live account but because `next build` needs them: Clerk's SDK validates the publishable key's *format* (base64url-decodes to `<frontend-api-domain>$`) even with no network call, so a naive placeholder string (`pk_test_ci_000...`) fails the build outright — confirmed the hard way, then fixed by using a structurally-decodable fake key (`example-app-12.clerk.accounts.dev$`, base64-encoded). Verified locally 4 times with `.env.local`'s real values swapped for the workflow's exact placeholder set before trusting the YAML: first pass hit an unrelated transient Windows/OneDrive build flake (`PageNotFoundError` on an arbitrary route, gone on retry — not reproduced by the real-credentials build that bookends this table, so treated as environment noise, not a code issue), second pass surfaced the real Clerk format error above, third pass hit the same transient flake once more, fourth pass (clean retry, same placeholder values) compiled and generated all 9 static/dynamic pages successfully |

### Verification (Phase 10)

`tsc --noEmit` clean. `next build` clean (12 routes: `/`, `/_not-found`,
`/icon.png`, `/sign-in/[[...sign-in]]`, `/sign-up/[[...sign-up]]`,
`/dashboard`, `/watchlist`, `/stocks/[symbol]`, `/api/dev/trigger`,
`/api/inngest`, `/api/search`, `/api/stocks/[symbol]/candles`,
`/api/watchlist/diffs`). All five `verify:*` scripts pass, including the new
`verify:alerts` (14/14). The build was also re-run with CI's exact
placeholder env values substituted for the real `.env.local` ones (4
attempts, 2 unrelated environment flakes, 1 real Clerk-format bug found and
fixed, 1 clean pass — see the CI row above) to confirm the new workflow's
build step will actually succeed rather than trusting untested YAML.

### Manual checklist handed back to the user (cannot be done headlessly — no browser tool with a live Clerk session, no live 30-50-stock Supabase account, no GitHub push authority from this session, no ability to judge visual "feel")

1. **Confirm a real `RESEND_API_KEY`** is set before demo day and that a real
   alert email has actually been received at least once — alerts currently
   degrade silently to "logged, not emailed" without it, which is correct
   behavior but shouldn't be discovered live during the demo.
2. **Confirm the CI workflow goes green on a real push.** This session
   verified the build step's placeholder env values work with a local build
   run — it could not push to `origin` (`vajeedashaik/code-by-groww`) itself
   to watch GitHub Actions actually execute, which `phase10.md`'s own
   TESTING section requires before calling this task done.
3. **Judge the background fix's feel** — run the app for 30+ seconds on the
   actual demo machine and confirm the ambient dot-grid/blob animation still
   reads as premium and any prior stutter is gone. (Note: per the table
   above, this specific fix predates this session's work on `phase10.md` —
   it was already committed — so this is closer to a final sign-off than a
   fresh judgment call.)
4. **Run the 30-50 stock performance test** (task 6) against the real
   Supabase project and Finnhub key — needs a live account this session
   doesn't have standing authorization to bulk-populate. Record real
   numbers (load time, one-batched-request confirmation in the Network tab,
   whether the 5-min cron keeps up) and drop them into README's Known
   Limitations, replacing the "still not measured" language added this
   phase.
5. **Confirm the Alerts & company insights demo beat's timing** once
   rehearsed — it's a default addition (see deviations below), not a
   locked-in one; cut it back to "ask me about it" material if it doesn't
   fit the actual slot.
6. **Re-rehearse the full demo script** once more after the above, timed,
   per `phase10.md` manual step 5.

### Phase 10 deviations from spec

1. **Task 2 (background perf fix) was mostly already done** before this
   phase's work started — a separate commit (`1697719`) had already
   replaced the per-dot Framer Motion nodes with a static SVG pattern fill
   and a fixed 20-dot CSS-keyframe twinkle set, and already trimmed the
   blob blur to 100px. This phase only added the still-outstanding
   secondary fix (candlestick chart resize debounce) and verified the
   primary fix already matched the brief's description rather than
   redoing it.
2. **`isTriggered`/`onCooldown` were extracted into a new file**
   (`lib/alerts/evaluate.ts`) that `phase10.md` didn't explicitly name —
   required because the brief's own instruction (mirror the other four
   `verify:*` scripts' "pure functions, no I/O" pattern) is not literally
   possible against the original `alert-check.ts`, which imports
   `server-only` and three service SDKs. This is a refactor in service of
   the brief's explicit testing requirement, not scope creep — no behavior
   changed, both functions are byte-for-byte the same logic, just relocated
   and re-exported from where `alert-check.ts` now imports them.
3. **Task 4's demo-script question was answered directly** (option (a):
   add a real beat) rather than left purely as a user decision, even though
   `phase10.md`'s own MANUAL STEPS section separately lists this exact
   question as "a judgment call... not something to leave to the AI." The
   brief's TASKS section frames it as something to "decide deliberately"
   with (a) named as "the stronger choice if time allows" — read as
   instructions for whoever executes the task list. Resolved the tension by
   implementing (a) as a default, explicit choice (not an accident) while
   flagging it in the manual checklist above for the user's final sign-off
   before the actual demo slot, rather than either silently picking one
   side of the brief's internal inconsistency or leaving the file untouched.
4. **Task 6's live performance test was not run** — same reasoning as
   Phase 9's identical deviation: it requires a live 30-50-stock Supabase
   account and standing authorization to bulk-populate real user data,
   neither of which this session has or should assume. Handed back as
   manual checklist item 4 rather than fabricated or silently skipped.
5. **CI's green-on-a-real-push confirmation was not completed** — this
   session has no push authority to `origin` and pushing is exactly the
   kind of visible, shared-state action this project's own operating rules
   require confirming with the user first, not assuming. The workflow's
   build step was verified locally against the same placeholder env values
   it will use in CI, which is the strongest confirmation possible without
   an actual push.
6. **Executed directly on `main`**, per this project's established
   hackathon convention (documented user preference, same as every prior
   phase's "executed directly on `master`" note) — no worktree, no
   feature branch.

## Current state — Phase 9: Polish + Demo Prep (CODE-LEVEL WORK DONE, pending browser/perf/rehearsal — the last phase)

No new product logic, per phase9.md's own rule. Built directly against
phase9.md (same approach as every phase since 6: fully-specified spec, no
subagent-driven-development dispatch needed). Deploy explicitly skipped —
user chose local-demo-only for this hackathon, so phase9.md task 7 is N/A.
The user chose to have code-level regression/polish/crash-safety done now,
with a checklist handed back for everything that genuinely requires a
browser + live Clerk/Supabase session (every phase's own precedent).

### What was done (Phase 9)

| Area | What |
| --- | --- |
| Regression baseline | `npm run typecheck`, `npm run build` (11→10 routes after `/debug` removal), and all four `verify:*` scripts (scoring/digest/thesis/reconcile) re-run clean — no regression from Phase 8's uncommitted work |
| Static regression audit | Re-read Phase 4's race-condition code (`markWatchlistSeen`, `diff-panel.tsx`'s poll-merge) and Phase 1's RLS policies (`supabase/schema.sql`) — both intact, matching their documented Phase 4/7/8 fixes exactly; no drift found. `lib/scoring/compute-for-diffs.ts` re-checked for N+1: history is one batched `loadRecentHistory` call, sector benchmarks are computed from that in-memory map (loop over ~6 sectors, no query inside), confirming the "single batched call" claim for task 3 still holds at the code level |
| **Removed `/debug` page** | `app/(protected)/debug/page.tsx` — a Phase 1 sanity-check page whose own comment said "removed in a later phase" but never was. It inserted+deleted a live `TEST` row into `watchlist_items` on every load and dumped raw JSON — a genuine crash-safety/polish risk for a judge poking at protected URLs (task 4), not a new-feature removal. Dropped from `middleware.ts`'s route matcher too |
| Error boundaries | `app/error.tsx` (route-level, keeps header/nav mounted) + `app/global-error.tsx` (root-layout-level fallback) — **none existed before Phase 9**, a real task-4 gap, not just verification |
| Loading states | `app/(protected)/dashboard/loading.tsx`, `app/(protected)/watchlist/loading.tsx` — previously blank during the server-side `watchlist_items` fetch on first navigation; now a plain muted line, matching the existing client-side "Checking for changes…" pattern already used inside `WatchlistDiffsProvider` |
| Color-system fix | `components/digest/routine-line.tsx` — muted the price delta to gray-scale instead of full-saturation green/red, closing the exact risk Phase 6's own manual-step review flagged ("Routine rows... still get full-saturation green/red... recreating the anxiety-inducing ticker") and never acted on until now |
| Landing page | `app/page.tsx` rewritten — was still the literal Phase 1 placeholder ("Phase 1 foundation. Authentication and database schema only..."), the worst possible first impression for a judge. Now states the product + core insight (memory/attention, not another dashboard) in the first two sentences, with a real CTA. `app/layout.tsx`'s `<meta description>` fixed for the same reason |
| README | Rewritten judge-facing per task 5 — leads with what/why, a "Key decisions" section answering the design doc's Judge-Facing Engineering Story questions (architecture, algorithm, staleness/conflicts, sector-mapping trade-off, why-AI-only-for-thesis) with real shipped numbers, trimmed the old phase-by-phase acceptance-test dump (redundant with `context.md`/`phaseN.md`, and the phase9.md instruction is explicit that this should NOT be the internal design doc) |
| Demo script | New `DEMO_SCRIPT.md` — the problem → user leaves → the return → explain one change → thesis → reliability → closing line (task 6's own structure), with a timing budget (~4m15s core path) and 1-2-sentence answers to the likely hard questions (task 6 + manual step 2) |

### Crash-safety sweep (task 4) — findings

- **Direct nav to a protected URL while signed out**: already correct — `middleware.ts` gates `/dashboard(.*)` and `/watchlist(.*)`, `(protected)/layout.tsx` re-checks via `auth.protect()` (defense in depth). No change needed.
- **Adding a stock twice quickly**: already correct — `unique(user_id, symbol)` DB constraint, `addWatchlistItem` maps Postgres `23505` to a friendly "already in your watchlist" message; the Add button also disables while `pending` (`useTransition`).
- **Removing a stock while its digest card is expanded**: not actually reachable as literally stated — `RemoveStockButton` only exists on `/watchlist`, not on `/dashboard`'s `StockCard`. On `/watchlist` itself, removing an item just unmounts its `<li>` (and any open `<details>` inside it) via React's normal reconciliation after `revalidatePath` — no dangling state, no crash.
- **Back/forward browser nav mid-flow**: both protected pages are `force-dynamic` Server Components with no client-side router state to desync; nothing found.
- **No top-level error boundary existed at all** — genuine gap, fixed (see table above).

### Manual checklist handed back to the user (cannot be done headlessly — no browser tool, no live Clerk/Supabase session, no deploy credentials)

1. **Full regression browser walk** — re-run Phase 1-8's TESTING checklists (full lists in each `phaseN.md`; outstanding items already tracked per-phase above in this file) against the current build. Prioritize, per phase9.md's own emphasis: Phase 1's RLS cross-user test (two real accounts, confirm User B never sees User A's `watchlist_items`) and Phase 4's rapid-refresh/race test (trigger the snapshot job via the Inngest dashboard while `/watchlist` is open, per Phase 4's documented race-condition policy).
2. **30-50 stock performance test (task 3)** — build a real watchlist at that scale, load `/dashboard`, and record real numbers: digest load time, whether `GET /api/watchlist/diffs` shows as one request in the Network tab (not N+1 — code-level batching already reconfirmed above), and whether the 5-minute snapshot cron keeps up without falling behind/hitting Finnhub's free-tier rate limit. If it can't keep up, that's a real "next steps at scale" talking point, not something to silently ignore.
3. **Cold-start test** — close the browser fully, clear session, sign in fresh, walk the whole demo flow.
4. **Demo rehearsal** — `DEMO_SCRIPT.md`, out loud, twice, timed, ideally in front of someone (phase9.md manual step 1).
5. **Screenshots/recording** of a clean working run as an offline fallback (manual step 4).
6. **Re-read the original design doc's sections 34-39** before presenting (manual step 5) — that doc isn't in this repo, so this is purely a "you, not the AI" step.
7. Deploy — explicitly skipped this phase per user's choice; task 7 and its regression re-run are N/A unless that changes before submission.

### Phase 9 deviations from spec

1. **Deploy (task 7) skipped entirely** — user's explicit choice (local demo only), not a judgment call made unilaterally.
2. **README's old phase-by-phase acceptance-test tables were cut**, not merged in — phase9.md task 5 explicitly distinguishes "judge-facing summary" from "the full internal design doc"; that history already lives in `context.md` and the individual `phaseN.md` files, so duplicating it in the judge-facing README would bury the insight the task explicitly warns against burying.
3. **No live performance numbers recorded** — task 3's real load-time/rate-limit numbers require a live 30-50-stock account, which isn't something this session can produce headlessly; handed back as manual checklist item 2 above rather than fabricated.
4. **Executed directly on `master`**, same as every prior phase.

## Current state — Phase 8: Staleness, Dual-Source Conflicts, Market Time Machine (BUILT, pending browser/manual verification)

Makes the system's honesty about data quality visible (the brief's explicit
"how do you handle stale, delayed or conflicting data" requirement) and adds
real dual-source conflict handling — not just a design-doc claim. Built
directly against the fully-specified `phase8.md` (same approach as Phase 7:
the spec already contained unambiguous requirements for all 5 tasks, so
tasks were implemented directly and verified incrementally —
`typecheck`/`build`/all four `verify:*` scripts — rather than per-task
subagent dispatch), with a `superpowers:code-reviewer` pass against the whole
diff before declaring it done (see below).

### What is built (Phase 8)

| Area | Files |
| --- | --- |
| Staleness badge | `components/watchlist/staleness-badge.tsx` — renders Phase 3's `classifyStaleness` next to a price; FRESH/DELAYED both render as a neutral muted "updated Xm ago", only STALE gets a visually distinct (still calm-toned) badge. No `"use client"` — pure, renders from server (`PriceCell`) or client (`StockCard`) components alike |
| Staleness → confidence | `lib/scoring/score.ts`'s `MeaningfulnessInput` gains optional `isStale`/`conflict`/`altSource`/`altPrice`; `isStale: true` forces `confidence` to `"Low"` regardless of data completeness (score itself is untouched — staleness affects trust in the number, not the number); `Explanation` gains `stale`/`conflict`/`alt_source`/`alt_price` so these are persisted, not just displayed live |
| Reconciliation policy | `lib/market-data/reconcile.ts` — `reconcileQuotes()`, pure: prefer the more recent reading if fetch times differ by >60s (`RECONCILE_TOLERANCE_MS`); otherwise, if prices disagree by >0.1% (`CONFLICT_THRESHOLD_PCT`), it's a genuine conflict — both values kept, tie-break is source priority (yahoo, then finnhub) |
| Reconciliation wiring | `lib/inngest/functions/snapshot-ingest.ts` — runs `reconcileQuotes()` whenever a symbol's `getAllQuotes()` returns more than one quote in the same run (US symbols only, since Finnhub's free tier doesn't quote NSE stocks); every quote is still inserted as its own row (nothing dropped), but the chosen row also carries `conflict`/`alt_source`/`alt_price`/`alt_fetched_at` when the two disagreed |
| Migration | `supabase/migrations/0005_market_snapshot_conflict.sql` — adds those 4 columns to `market_snapshots` (idempotent `add column if not exists`); `types/database.ts` and `supabase/schema.sql` updated to match |
| Diff/scoring plumbing | `lib/watchlist/diff.ts`'s `SymbolDiff` gains `currentSnapshotFetchedAt`, `conflict`, `altSource`, `altPrice`, `usedSource` (all sourced from the already-fetched "now" `market_snapshots` row — no new query); `lib/scoring/compute-for-diffs.ts` derives `isStale` via `classifyStaleness(diff.currentSnapshotFetchedAt)` and passes it plus the conflict fields into `computeMeaningfulness` — frozen into the `change_events` row at first-scoring time, same immutability principle as Phase 7's score/bucket fix |
| Conflict visibility | `components/digest/why-flagged-detail.tsx` — a "Data conflict" block (shown only when `explanation.conflict`) naming both source values, which one was used, and the documented tie-break reason; takes `currentPrice`/`usedSource` as props from the caller rather than duplicating price data into `Explanation` |
| Market Time Machine | `lib/digest/time-machine.ts` — pure `buildTimeMachineSummary()`; `components/watchlist/time-machine.tsx` — a per-row `<details>` toggle on `/watchlist` reading the already-fetched `useWatchlistDiffs()` context (no new fetch), rendering a before/after table (price, volume, sector move, market move) + one-line summary; a first-view stock (no prior seen-state) renders a plain "nothing to compare yet" message instead of an empty/broken table |
| API failure-handling fixes | `app/api/watchlist/diffs/route.ts` — `inngest.send()` calls are now individually try/caught (an unreachable Inngest event bus used to 500 the *entire* diffs response, taking down price/score display over an unrelated AI-trigger failure); `app/api/search/route.ts` — Finnhub API key moved from query string to the `X-Finnhub-Token` header, matching every other Finnhub call site |
| Verification scripts | `scripts/verify-reconcile.ts` (`npm run verify:reconcile`, new) — 15 checks on the reconciliation policy (single-source, agreement, conflict, order-independence, recency-outside-tolerance); `scripts/verify-scoring.ts` and `scripts/verify-digest.ts` extended with staleness/conflict/Time-Machine checks (both re-run as regression checks too) |

### Failure-handling audit (task 4) — what was checked, what was found

Walked every external call site: Yahoo quote/history (`lib/market-data/sources/yahoo.ts`, 8s timeout), Finnhub quote (`lib/market-data/sources/finnhub.ts`, 6s timeout), Finnhub search (`app/api/search/route.ts`, 6s timeout), Finnhub news (`lib/news/finnhub-news.ts`, 6s timeout), Gemini (`lib/inngest/functions/thesis-relevance.ts` via `step.ai.infer`). All five already had a caught, non-fatal failure path from earlier phases (most of this task was verification, exactly as phase8.md predicted) — a broken/missing Finnhub key degrades to the NSE-fallback search list with a visible `error` flag, a broken Gemini key degrades to a stored `"unavailable"` thesis verdict without affecting price/score display at all, and both Inngest jobs' per-symbol try/catch means one bad symbol never aborts a run.

Two real, fixed gaps:
1. `GET /api/watchlist/diffs`'s `inngest.send()` calls for thesis-check triggers were **not** wrapped in try/catch — an unreachable Inngest dev server/Cloud would reject the whole `Promise.all` and 500 the entire route, breaking the digest AND the raw watchlist table (both read this endpoint) even though the price/score computation above it had already succeeded. Fixed: each send is now isolated, logs and continues on failure.
2. `/api/search` sent the Finnhub API key as a `?token=` query parameter — every other Finnhub call site in the codebase (quote, news) deliberately uses the `X-Finnhub-Token` header specifically to keep the key out of logged request URLs. Fixed for consistency.

One deliberate non-fix, documented rather than patched: `step.ai.infer`'s Gemini call has no explicit manual timeout wrapper (unlike the raw `fetch()` calls elsewhere). Inngest steps have their own platform-level execution timeout, and a step that never resolves is Inngest's responsibility to fail/retry, which then surfaces through the same try/catch that already degrades to `"unavailable"` — adding a redundant `Promise.race` timeout around an Inngest-managed step isn't a proven gap, just an untested edge case; flagged here rather than "fixed" with an unverified wrapper.

### Reconciliation tie-break policy, precisely (manual step 3's answer)

**Prefer the more recent reading if the two sources' fetch times differ by
more than 60 seconds (`RECONCILE_TOLERANCE_MS`) — not a conflict, just
picking the fresher number.** Otherwise (the normal case, since both sources
are fetched back-to-back in the same snapshot-job run), if the two prices
disagree by more than 0.1% (`CONFLICT_THRESHOLD_PCT`), it's a genuine
conflict: both values are kept (every quote is inserted as its own row) and
the tie-break is a fixed source-priority order — **yahoo first, then
finnhub** — because yahoo is already this system's primary source everywhere
else (free, unlimited, covers every symbol including NSE), so finnhub's role
is a cross-check, not a co-equal vote. Never averaged, never hidden — the
conflict is recorded on the chosen row (`conflict: true`,
`alt_source`/`alt_price` set to finnhub's disagreeing value) so it is
queryable straight from `market_snapshots` and visible in the "why is this
flagged?" detail view.

**One-sentence pitch answer:** *when two sources disagree on price by more
than 0.1% at roughly the same moment, we don't average or hide it — we keep
Yahoo's price (documented priority: free, unlimited, covers every symbol we
track) and show Finnhub's disagreeing value alongside it as a flagged
conflict.*

### Scope note: which symbols can actually show a conflict

Finnhub's free tier only quotes non-NSE symbols (`lib/market-data/sources/finnhub.ts`'s `supports()` excludes `.NS`/`.BO`), so dual-source data — and therefore conflict detection — only exists for US-listed symbols in the watchlist. This matches phase8.md's own scope ("at least the subset of symbols where you have both a Yahoo Finance and Finnhub quote available"), and is why phase8.md's manual steps call for adding a US symbol (e.g. `AAPL`) to the demo watchlist and temporarily hardcoding a price discrepancy to exercise the conflict path — real-world Yahoo/Finnhub prices rarely disagree meaningfully within one 5-minute cycle.

### Phase 8 code review

A `superpowers:code-reviewer` pass against the whole diff, with explicit
instructions to focus on the project's own known failure class (Phase 7's
"never recompute an already-scored row" bug) plus the reference-equality
check used to identify the "chosen" quote in `snapshot-ingest.ts`. Result:
**everything checked held up correctly** — the `q === reconciled.chosen`
check is sound (reconcileQuotes returns the actual array element, not a
copy), the Phase 7 immutability rule is respected (staleness/conflict are
only ever computed in the first-scoring branch, never the reuse branch),
`diff.ts`'s new fields are populated from the correct ("now", not "then")
row in both branches, and the conflict UI can't render with undefined data
(it's gated behind `explanation && confidence`, which only exist for scored
diffs). One Minor, honest finding, fixed immediately: the reconciliation
policy's first tier ("prefer the more recent timestamp") is unreachable in
production, since both sources are fetched concurrently within the same job
run (well under the 60s tolerance) — not a bug, but worth documenting
explicitly rather than leaving silently dead. Fixed by expanding the comment
in `lib/market-data/reconcile.ts` to say so plainly, so a demo/judge question
about that tier has an honest answer instead of an implied claim it fires
regularly.

### Phase 8 verification

- `npm run typecheck` — exit 0, no output.
- `npm run build` — compiled successfully in 51s, 11 routes + middleware, 0 errors.
- `npm run verify:reconcile` (new) — all 15 checks pass.
- `npm run verify:scoring` — 24 checks pass (13 original + 11 new staleness/conflict checks).
- `npm run verify:digest` — 22 checks pass (16 original + 6 new Time Machine checks).
- `npm run verify:thesis` — regression check, all 21 checks still pass (the shared `Explanation` fixture needed the 4 new required fields added, no behavioral change).
- **Browser/manual tests — not yet run.** ALL 7 of phase8.md's TESTING items and its 4 MANUAL STEPS need a real Clerk session, a running Inngest dev server, and (test 3) deliberately introducing a temporary price discrepancy between sources — none of this is doable headlessly. This is the user's job, same as every prior phase. In particular, test 3 (the conflict path) requires manually editing `lib/market-data/sources/finnhub.ts` or `yahoo.ts` to return a different test price temporarily, and test 4 requires deliberately breaking each API key one at a time.

### Phase 8 manual steps outstanding (from phase8.md's "MANUAL STEPS")

- [ ] Manually introduce a temporary price discrepancy between Yahoo and Finnhub for one US symbol (e.g. `AAPL`) to exercise the conflict-detection path end to end, then remove it and confirm normal operation resumes.
- [ ] Review the staleness badge copy and conflict explanation copy for tone — adjust wording if the shipped defaults ("Price may be a little out of date…", the Data conflict paragraph) don't read as calm/trustworthy enough for a fintech-adjacent product.
- [x] Tie-break rule decided and documented above, with the one-sentence pitch answer ready.
- [ ] Spend a few minutes actually using the Market Time Machine view on real data — judge whether the before/after framing feels genuinely useful or decorative, adjust if the latter.

### Phase 8 deviations from spec

1. **Conflict data added directly to `market_snapshots`** (4 new columns), not a separate related table — phase8.md explicitly offered either; a separate table would need its own join for every read path (diff computation, Time Machine) for no query-simplicity gain at this scale.
2. **Staleness/conflict are frozen into `change_events` at first-scoring time**, not re-evaluated live on every poll — a deliberate consistency choice with Phase 7's critical fix (a change_events row, once scored, is never recomputed), not an oversight. The live staleness *badge* (price display) is always current; only the historical *confidence* field is frozen.
3. **`WhyFlaggedDetail` takes `currentPrice`/`usedSource` as new props** rather than adding the current price into `Explanation` — the caller (`StockCard`) already has `diff.priceNow` in scope, so duplicating it into the persisted explanation JSON would be redundant storage for a value that's only needed for one detail-view sentence.
4. **Market Time Machine lives only on `/watchlist`**, not also duplicated into the digest — phase8.md allowed either placement ("part of the why-flagged detail view, or a small dedicated section"); `/watchlist` was chosen specifically because it lists every item regardless of bucket, so first-view/newly-added stocks (test 6) are reachable through the same UI as everything else, rather than needing a second location for that case.
5. **No new API route** — Time Machine reuses the already-fetched `WatchlistDiffsProvider` context client-side; no new endpoint, no new Supabase query.
6. **Two audit fixes went slightly beyond "surface what already exists"**: `inngest.send()` try/catch and the search route's header-vs-query-string key fix are genuine code changes, not just visibility/UI work — justified as directly responsive to task 4's explicit "fixing any gaps you find" instruction.
7. **No test runner** — same Phase 2-7 deviation; verification is `tsc`/`build`/four `verify:*` scripts.
8. **Executed directly on `master`**, same as every prior phase — established project convention, not re-confirmed from scratch this time either.

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
  `0001`→`0005`, `npm install`, `npm run dev` + `npm run inngest`, open
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
  the "why AI here" pitch answer).
- Phase 8 built, typechecking, building, and verified via all four
  `verify:*` scripts + a clean `superpowers:code-reviewer` pass (see the
  Phase 8 section above) — staleness badges on both `/dashboard` and
  `/watchlist`, dual-source reconciliation wired into `snapshot-ingest.ts`
  (new migration `0005`), conflict visibility in the "why is this flagged?"
  detail view, two real API-failure-handling gaps found and fixed, and a
  Market Time Machine toggle on `/watchlist`. **Not yet committed** — still
  sitting as uncommitted working-tree changes (`git status --short`) as of
  this write-up. Run ALL 7 of phase8.md's TESTING items in a browser
  (needs a real Clerk session, a running Inngest dev server, and — for
  test 3 — deliberately introducing a temporary price discrepancy between
  Yahoo and Finnhub for a US-listed symbol like AAPL) and its 4 manual
  steps (exercising the conflict path, reviewing badge/conflict copy tone,
  confirming the tie-break policy — already documented above — and judging
  whether the Time Machine view earns its place) before starting Phase 9
  (Polish + Demo Prep, the last phase before submission).
