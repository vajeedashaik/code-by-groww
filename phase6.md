CONTEXT
Continuing the smart market watchlist project (Next.js 15 App Router,
TypeScript, Tailwind, Clerk, Supabase, Inngest). Phases 1-5 are complete:
auth/DB/RLS, watchlist CRUD, a live market data pipeline, race-safe
seen-state diffing, and a working, tested meaningfulness engine producing
scores, buckets, and structured explanations in change_events. This is
Phase 6 of 9 — the primary UI surface. This is the screen judges will
actually look at and remember, so treat this phase as seriously as
Phase 5's logic. Do not build thesis features or resilience/staleness UI
yet — this phase is purely about presenting what Phase 5 already
computes, well.

GOAL FOR THIS PHASE
Replace the plain list from Phases 4-5 with the actual product
centerpiece: a dedicated "While you were away" digest that greets the
user with a compressed, ranked summary of what changed and why, plus a
per-stock "Why is this flagged?" explainability view. This is the moment
the product's core promise becomes visible and demoable.

TASKS

1. Digest page structure
   - Build a dedicated view (e.g. /dashboard or a distinct /digest route
     — your call, but it should be the first thing a returning user
     sees) that opens with a clear summary line, e.g.
     "6 meaningful changes across 12 stocks" — computed from real
     change_events data, not hardcoded.
   - Group stocks into three sections matching the Urgent / Notable /
     Routine buckets from Phase 5. Urgent and Notable should be
     expanded by default; Routine should be collapsed by default
     (this collapsing is not cosmetic — it's the actual "attention
     rationing" product thesis made visible, so don't skip it or treat
     it as optional polish).
   - Stocks with no meaningful change (or first-view stocks) shouldn't
     clutter this view — first-view stocks can appear in a lightweight
     "newly added" section instead, separate from the change digest.

2. Per-stock summary card
   - For each flagged stock in Urgent/Notable, show: symbol/name,
     price + % change since last seen, time since last seen, and a
     short one-line plain-language interpretation generated from the
     explanation object (e.g. "Moved independently of its sector on
     unusually high volume" vs "Mostly tracked the broader market") —
     build this as a small set of template rules driven by which
     factors dominated the score, not a fixed static sentence per stock.
   - Routine-bucket stocks can be a compact single line each (symbol,
     % change, nothing more) since these deliberately need less visual
     weight.

3. "Why is this flagged?" detail view
   - Clicking/expanding a flagged stock reveals the full evidence trail
     from the explanation object: price move, price z-score, sector
     comparison, market comparison, volume ratio, confidence level —
     labeled clearly, not just raw numbers dumped on screen.
   - This view should make the scoring feel auditable, not magical —
     that's the point of building it as a real feature rather than a
     black box.

4. Empty and edge states
   - Zero meaningful changes since last visit → a clear, calm state
     ("Nothing meaningful changed since you last checked" or similar),
     not an empty-looking broken page.
   - First-ever visit with a populated watchlist but no prior seen-state
     for any symbol → show the "newly added / first look" state cleanly,
     not an empty digest.
   - Very large watchlist (10+ stocks, several flagged) → confirm the
     page remains scannable, not an overwhelming wall — this is where
     the bucketing/collapsing from task 1 earns its keep.

5. Visual design
   - This is real design work, not filler — use clear typographic
     hierarchy (the summary line should read like a headline), restrained
     color use for bucket severity (avoid turning this into a
     red/green anxiety-inducing ticker, which directly contradicts your
     own product thesis), and generous whitespace. Reference the
     frontend-design conventions you're working with for spacing/type
     scale rather than defaulting to a generic dashboard look.
   - Keep the existing raw watchlist table (from Phase 2/4) accessible
     as a secondary view/tab — the digest is the new front door, not a
     replacement for being able to see everything at a glance if wanted.

6. Mark-as-seen timing (carry over from Phase 4, verify here)
   - Confirm the "mark as seen" call still fires only after the digest
     has rendered and the diff has been shown to the user — re-verify
     this explicitly now that the UI has changed, since it's easy to
     accidentally break this ordering while restructuring components.

WHAT NOT TO DO IN THIS PHASE
- No thesis display or thesis-relevance verdicts yet — that's Phase 7,
  even though the thesis text already exists in the DB from Phase 2.
- No staleness/confidence badges in the main digest yet — Phase 8. A
  confidence label can appear inside the "why flagged" detail view
  from task 3 since Phase 5 already produces it, but don't build the
  dedicated staleness UI yet.
- Don't add animations, transitions, or micro-interactions beyond
  basic, functional ones — defer real polish to Phase 9 once every
  phase's content actually exists to polish.

---

MANUAL STEPS (must be done by you, not the AI/code)

1. Look at the digest with your own real test data and honestly judge:
   does the summary line and bucketing actually feel calm and useful,
   or does it still feel like a noisy dashboard? This is a product judgment
   call only you can make by looking at it, not something to blindly
   accept from a first pass.
2. Manually write/tune the template rules for the one-line interpretation
   (task 2) against a handful of your real change_events — generic AI-
   written templates often sound stiff; read them out loud and rewrite
   any that don't sound like something a sharp human analyst would say.
3. Decide the exact copy for empty/calm states (task 4) — small wording
   choices here ("nothing meaningful changed" vs "all quiet") matter more
   than they seem for how thoughtful the product feels, spend a few
   minutes on this deliberately.
4. Take screenshots of this digest once it looks good — you'll want
   these for your submission/pitch deck regardless of how later phases go.

---

TESTING — DO NOT MARK THIS PHASE DONE UNTIL ALL OF THESE PASS
1. With a watchlist containing a mix of Urgent, Notable, and Routine
   stocks (from real Phase 5 data), load the digest → confirm correct
   bucketing, correct default expand/collapse behavior, and an accurate
   summary count line.
2. Click into a flagged stock's "why is this flagged?" view → confirm
   every value shown matches the underlying change_events.explanation
   data exactly (cross-check against Supabase directly, don't just
   trust the UI renders something plausible-looking).
3. Trigger the zero-meaningful-changes state (e.g. by viewing right
   after already marking everything as seen with no new snapshot) →
   confirm the calm empty state shows correctly, no broken layout.
4. Trigger the first-visit/newly-added state with a fresh test watchlist
   → confirm it's visually distinct from the "nothing changed" state
   (these are different situations and should not look the same).
5. Test with 15+ stocks, several flagged → confirm the page stays
   scannable and doesn't require excessive scrolling to find what
   matters (Urgent items especially should be immediately visible above
   the fold).
6. Confirm mark-as-seen still only fires after the digest has rendered
   — reload the page, confirm the diff show correctly once, then reload
   again immediately and confirm it now correctly shows "no new change"
   rather than repeating the same diff.
7. Resize the browser to a mobile-width viewport → confirm the digest
   remains usable and readable, not broken or requiring horizontal
   scroll.
8. Have someone unfamiliar with the project (or come back after a break
   yourself) look at the digest cold for 10 seconds and describe what
   they think it's telling them — if they can't roughly explain it, the
   design needs another pass before moving on.

Report back: what passed, what failed, screenshots if you have them, and
any deviations from spec, before we move to Phase 7 (Personal Thesis +
AI Relevance Check) — this is where your standout differentiator gets
layered on top of a digest that already works well on its own.