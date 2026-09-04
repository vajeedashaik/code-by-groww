CONTEXT
Continuing the smart market watchlist project (Next.js 15 App Router,
TypeScript, Tailwind, Clerk, Supabase, Inngest). Phases 1-7 are complete:
auth/DB/RLS, watchlist CRUD, market data pipeline, race-safe diffing, the
meaningfulness engine, the digest UI, and thesis-relevance checking. This
is Phase 8 of 9 — making the system's honesty about data quality visible,
and adding dual-source conflict handling. This phase directly answers
the brief's explicit "how do you handle stale, delayed or conflicting
data" requirement with real, demoable behavior, not just a design doc
claim. Do not add new features beyond what's listed — this phase is
about surfacing and hardening what already exists, plus one new piece
(dual-source reconciliation).

GOAL FOR THIS PHASE
Every piece of market data shown to the user is honestly labeled with
its freshness. When two data sources disagree, the system picks one
deterministically, explains why, and doesn't hide the disagreement. A
simple before/after comparison view ("Market Time Machine") lets a user
see exactly what changed between two points in time for a stock.

TASKS

1. Staleness surfaced in the UI
   - The staleness classification function already exists from Phase 3
     (FRESH/DELAYED/STALE based on snapshot age). Surface it visibly:
     a small, unobtrusive badge/label next to price data in both the
     digest (Phase 6) and the raw watchlist table (Phase 2/4) — e.g.
     "updated 2 min ago" in a neutral tone, escalating to a clearer
     warning style only for STALE, not for FRESH/DELAYED (don't make the
     UI anxious-looking for normal delay, that contradicts your product
     thesis).
   - If a symbol's latest snapshot is STALE, the meaningfulness score
     computed from it (Phase 5) should carry a visibly reduced confidence
     level — wire this through rather than silently scoring stale data
     as if it were reliable.

2. Dual-source reconciliation
   - For at least the subset of symbols where you have both a Yahoo
     Finance and Finnhub quote available (from the Phase 3 adapter
     layer), fetch both during the snapshot job instead of just the
     primary source.
   - Write an explicit, deterministic reconciliation policy: e.g. prefer
     the source with the more recent timestamp; if timestamps are within
     a small tolerance window but prices differ beyond a small threshold
     (e.g. >0.1%), flag it as a genuine conflict, store both values, and
     apply a documented tie-break rule (e.g. source priority order) while
     recording that a conflict occurred — don't average them silently,
     don't just pick one and hide the disagreement.
   - Add a `conflict` boolean and the alternate source's value to
     market_snapshots (or a small related table if cleaner) so this is
     queryable and demoable, not just logged and forgotten.

3. Conflict visibility
   - When a symbol's most recent snapshot had a recorded conflict, show
     a small, clear indicator in the "why is this flagged?" detail view
     from Phase 6 (not in the main digest card — this is detail-level
     transparency, not main-screen noise): both source values, which one
     was used, and why (per your documented policy).

4. API/dependency failure handling audit
   - Do a deliberate pass over every external call in the system
     (Yahoo Finance, Finnhub, Gemini) and confirm each one has: a
     timeout, a caught failure path that doesn't crash the surrounding
     job/request, and a sensible fallback or clear "unavailable" state
     surfaced to the user rather than a blank/broken UI. Most of this
     should already exist from earlier phases — this task is about
     verifying it systematically, not building it from scratch, and
     fixing any gaps you find.

5. Market Time Machine
   - Build a simple view (can be part of the "why is this flagged?"
     detail view, or a small dedicated section) that lets a user compare
     two points in time for a stock: pick "last seen" vs "now" (using
     data you already have from user_seen_state and market_snapshots) and
     show a clean before/after table — price, volume, sector move, market
     move — with a one-line plain-language summary underneath, similar in
     spirit to the design doc's Monday→Wednesday example.
   - This can reuse data and logic you've already built (Phase 4's diff,
     Phase 5's benchmarks) — it's primarily a presentation task at this
     point, not new computation.

WHAT NOT TO DO IN THIS PHASE
- Don't build a full historical scrubber/date-picker for arbitrary time
  ranges — "last seen vs now" is enough, that's what the product actually
  needs.
- Don't add conflict handling for every possible data field — price is
  the one that matters for this product, keep scope there.
- Don't rework the staleness thresholds from Phase 3 unless testing here
  reveals they're clearly wrong — this phase surfaces existing logic, it
  doesn't redesign it.

---

MANUAL STEPS (must be done by you, not the AI/code)

1. To genuinely test the conflict-detection path, you may need to
   manually and temporarily introduce a discrepancy (e.g. briefly hardcode
   a slightly different test value for one source) since real Yahoo/
   Finnhub prices may rarely disagree meaningfully in a short testing
   window — do this deliberately for the test below, then remove it.
2. Manually review the staleness badge copy and conflict explanation
   copy for tone — this is a fintech-adjacent product, wording should
   read as calm and trustworthy, not alarming. Adjust wording yourself
   if the AI-generated defaults feel off.
3. Decide your final source-priority tie-break rule (task 2) and write
   down the reasoning — you will be asked "how do you handle conflicting
   data sources" directly by judges, have a one-sentence answer ready.
4. Spend a few minutes actually using the Market Time Machine view
   yourself on real data and judge whether the "before/after" framing
   feels genuinely useful or just decorative — adjust if it's the latter.

---

TESTING — DO NOT MARK THIS PHASE DONE UNTIL ALL OF THESE PASS
1. View the digest and watchlist table → confirm staleness badges show
   correctly for FRESH data (subtle/neutral) without visual alarm.
2. Manually age a snapshot (set fetched_at far in the past directly in
   Supabase, as in Phase 3's test) → confirm it now shows a clear STALE
   indicator in the UI, and that its meaningfulness score/confidence
   reflects reduced trust.
3. Using the manual discrepancy from the manual steps section, trigger
   the snapshot job → confirm a conflict is correctly detected, both
   values are stored, the tie-break rule is applied correctly, and the
   "why is this flagged?" view shows the conflict clearly. Remove your
   manual discrepancy afterward and confirm normal operation resumes.
4. Temporarily disable/break each external dependency one at a time
   (invalid Finnhub key, invalid Gemini key, and simulate a Yahoo
   Finance failure if feasible) → confirm each failure is contained,
   produces a clear "unavailable" state in its relevant part of the UI,
   and does not break unrelated functionality (e.g. a broken Gemini key
   should not affect price display or the meaningfulness score at all).
5. Open the Market Time Machine view for a stock with a real diff →
   confirm the before/after table is accurate against the raw data in
   Supabase, and the plain-language summary correctly reflects the
   numbers shown.
6. Confirm a symbol with zero prior seen-state (first-ever view) handles
   the Time Machine view gracefully (no "before" to show) rather than
   erroring.
7. Full regression pass: reload the digest, watchlist table, and a few
   "why flagged" detail views end to end → confirm nothing from Phases
   4-7 broke while adding this phase's changes.

Report back: what passed, what failed, your final tie-break policy and
staleness thresholds, and any deviations from spec, before we move to
Phase 9 (Polish + Demo Prep) — the last phase before submission.