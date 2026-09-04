# Phase 7 — Personal Thesis + AI Relevance Check — Design

Status: approved. Brief: `phase7.md`. Continues Phase 1-6 (context.md).

## Goal

For any stock with both a user-provided thesis and a flagged (Urgent/Notable)
Phase 5 change, use one AI call to judge whether recent news supports,
contradicts, or is neutral to the user's stated thesis, and surface that
verdict in the digest. This is the only place AI touches the product —
kept narrow, explainable, and fully separate from the deterministic
Phase 5 scoring engine (the AI verdict never feeds back into
`meaningfulness_score`/`bucket`).

No DB schema changes needed: `change_events.thesis_verdict` (text) and
`change_events.explanation` (jsonb) already exist from Phase 1/5.

## Architecture

### New modules

| File | Purpose |
| --- | --- |
| `lib/news/finnhub-news.ts` | `getCompanyNews(symbol, {days, maxArticles})` — Finnhub `/company-news`, last 3-5 days, capped at 5 articles. Returns `[]` (not an error) when nothing found — the "no new information" case is a normal, expected result. |
| `lib/thesis/types.ts` | `ThesisVerdictCategory = "supports" \| "contradicts" \| "unclear" \| "no_new_information" \| "unavailable"`; `ThesisAnalysis` (see Data shapes below). |
| `lib/thesis/prompt.ts` | Pure `buildThesisPrompt(thesisText, articles, explanation, companyName)` → Gemini `GenerateContentRequest.contents` + a `responseSchema`. No I/O — testable like `lib/digest/interpret.ts`. |
| `lib/thesis/parse-verdict.ts` | Pure `parseVerdictResponse(raw: unknown): ThesisAnalysis`. Defensive: any missing/malformed field → `{verdict: "unavailable", summary: "...", signals: []}`. Never throws. |
| `lib/thesis/trigger.ts` | Pure `selectThesisChecksToRun(candidates, cap=5): candidate[]` — filters to bucket Urgent/Notable + non-empty thesis + `thesis_verdict === null`, sorts by score desc, takes top `cap`. |
| `lib/inngest/functions/thesis-relevance.ts` | Inngest fn, trigger event `thesis/relevance.requested`. |
| `scripts/verify-thesis.ts` | `npm run verify:thesis` — exercises `parse-verdict.ts` and `selectThesisChecksToRun` against edge cases (malformed JSON, missing fields, cap+priority ordering, already-assessed exclusion). |

### Modified

| File | Change |
| --- | --- |
| `lib/scoring/compute-for-diffs.ts` | Upsert call gains `.select("id, symbol, thesis_verdict")`. Returned `Map` value gains `changeEventId` and `existingThesisVerdict` so callers never need a second read. |
| `app/api/watchlist/diffs/route.ts` | Selects `thesis` from `watchlist_items` too. After scoring, builds candidates (score + bucket + changeEventId + existingThesisVerdict + thesis text), calls `selectThesisChecksToRun`, sends one Inngest event per selected candidate (see Cost control below). Merges `thesis: ThesisField \| null` into each diff in the response. Event send is awaited (fast local call) but the Inngest function itself is not — response returns immediately regardless of Gemini latency. |
| `components/watchlist/diff-panel.tsx` | `WatchlistDiffsProvider` gains polling: after the initial fetch, if any diff has `thesis \&\& thesis.verdict === null`, re-fetch `/api/watchlist/diffs` every 5s; stop when none are pending or after 60s elapsed (safety timeout). |
| `components/digest/stock-card.tsx` | If `diff.thesis` is non-null, renders "Your thesis: {text}" + a one-line status (verdict label, or "Checking against your thesis…" while `verdict === null`). |
| `components/digest/why-flagged-detail.tsx` | If `diff.thesis?.analysis` present, adds a "Thesis analysis" subsection listing each signal's reasoning underneath the existing Phase 5 evidence trail. |
| `app/(protected)/watchlist/page.tsx`, new `components/watchlist/edit-thesis.tsx`, `app/(protected)/watchlist/actions.ts` | New `updateWatchlistThesis(symbol, thesis, targetPrice)` server action (user-scoped update, `revalidatePath("/watchlist")`). Inline expand-to-edit UI per row, same interaction shape as the existing `remove-stock-button.tsx` two-step pattern. Never touches existing `change_events` rows — historical verdicts stay as they were assessed. |
| `.env.example` | Adds `GEMINI_API_KEY` under a new "Phase 7 — AI thesis check" section. |

## Data shapes

`ThesisAnalysis` (stored at `change_events.explanation.thesis_analysis`; the
top-level category is duplicated onto `change_events.thesis_verdict` for
simple querying):

```json
{
  "verdict": "supports" | "contradicts" | "unclear" | "no_new_information" | "unavailable",
  "summary": "one-line overall verdict",
  "signals": [
    { "source": "headline or 'price/volume/sector context'", "assessment": "supports" | "contradicts" | "neutral", "reasoning": "one concise sentence" }
  ],
  "newsWindow": { "days": 5, "articleCount": 0 },
  "assessedAt": "ISO timestamp",
  "model": "gemini-2.5-flash"
}
```

Diffs API response gains, per diff:

```json
"thesis": null
```
or
```json
"thesis": {
  "text": "EV growth + margin improvement",
  "verdict": "supports" | "contradicts" | "unclear" | "no_new_information" | "unavailable" | null,
  "summary": "...",
  "signals": [...]
}
```
`verdict: null` means "not yet assessed" (either just queued, or capped out
this load and waiting for a future load) — the UI shows the same "Checking…"
copy for both, since from the user's perspective there's nothing actionable
to distinguish.

## Cost/rate control

- **Never call the model for an already-assessed change event.** The route
  only selects candidates where `existingThesisVerdict === null`
  (task 3's primary guard).
- **Cap 5 per diffs-route call**, prioritized by score descending among
  Urgent+Notable thesis-bearing stocks (task 3's secondary guard, this
  phase's documented trade-off — a 6th+ eligible stock waits for a future
  change event, e.g. the next snapshot's diff, not this one).
- **Inngest event de-dup as the safety net for polling.** Each event is sent
  with `id: "${userId}:${symbol}:${changeEventId}"`. Since the client polls
  the diffs route every 5s while anything is pending, the route's
  candidate-selection re-runs every poll — but the same `id` within
  Inngest's de-dup window means the underlying model call only ever fires
  once per change event, no matter how many times the event is resent. This
  is what makes "poll for the UI update" and "cap the model calls" both true
  at once without extra state.

## Prompt & structured output

Uses Gemini's native `responseMimeType: "application/json"` +
`responseSchema` (confirmed supported by the installed `@inngest/ai`
adapter) rather than relying on prompt instructions alone to produce valid
JSON — the API itself constrains the output shape, so `parse-verdict.ts`'s
defensive path only has to handle "fields present but semantically empty"
(e.g. no news), not "model ignored the format instruction."

Prompt inputs: thesis text, company name, up to 5 (headline, summary,
date, source) news items (or an explicit "no recent news found" note when
empty), and the Phase 5 explanation object's price move / volume ratio /
market+sector context. Model asked for: per-signal assessment + reasoning,
one overall verdict + one-line summary. Exact prompt wording is a manual
tuning step (phase7.md MANUAL STEPS #2) — not frozen by this spec.

## Error handling

- No news found → still calls Gemini (prompt states this explicitly) so the
  model itself produces `no_new_information` rather than the code
  fabricating a verdict without a model call — keeps "thin data still gets
  a real, honest read" consistent with WHAT-NOT-TO-DO's "no fabricated
  confidence."
- `step.ai.infer` throws (bad key, quota, network) → caught inside the
  Inngest function; writes `thesis_verdict: "unavailable"` with a minimal
  `ThesisAnalysis` explaining why, function completes normally (not
  endlessly retried) — rest of the digest is unaffected (test 7).
- Malformed/unparseable model response → same `"unavailable"` path via
  `parse-verdict.ts`, never crashes or shows garbled text.

## What this phase does NOT do

- Does not change `meaningfulness_score` or `bucket` — thesis verdict is
  additive UI only.
- Does not call AI for non-flagged stocks, or more than once per change
  event.
- Does not build staleness/conflict UI (Phase 8).
- No new DB tables/migrations.

## Testing

No test runner in this repo (Phase 2-6 precedent). Verification:
`tsc --noEmit`, `next build`, `npm run verify:thesis` (new, pure-logic
checks on `parse-verdict.ts` + `selectThesisChecksToRun`), plus a regression
run of `verify:scoring` and `verify:digest`. Browser/Inngest-dashboard
tests are phase7.md's 9-item TESTING list — user's job, same as every prior
phase (needs a real Clerk session, real Gemini/Finnhub keys, and
Inngest-dashboard log inspection for the de-dup/cap claims).
