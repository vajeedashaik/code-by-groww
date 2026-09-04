CONTEXT
Continuing the smart market watchlist project (Next.js 15 App Router,
TypeScript, Tailwind, Clerk, Supabase, Inngest, Gemini via Inngest
step.ai.infer). Phases 1-6 are complete: auth/DB/RLS, watchlist CRUD, a
live market data pipeline, race-safe diffing, a working meaningfulness
engine, and a polished "while you were away" digest UI. This is Phase 7
of 9 — the standout differentiator. The thesis field has existed in
watchlist_items since Phase 2 but has never been read or used until now.
Do not build staleness/conflict UI yet — that's Phase 8.

GOAL FOR THIS PHASE
For any stock with both a user-provided thesis and a flagged (Urgent or
Notable) change from Phase 5, use an AI call to judge whether the recent
news/events support, contradict, or are neutral to the user's stated
reason for watching — and surface that verdict clearly in the digest.
This is intentionally the one place AI touches this product, and it must
stay narrow, explainable, and clearly separated from the deterministic
scoring engine.

TASKS

1. News/event fetching for context
   - For a flagged, thesis-bearing stock, fetch recent relevant news
     using Finnhub's company-news endpoint (already integrated in
     Signalist's pattern from earlier phases) — pull a small window
     (e.g. last 3-5 days, cap at ~5 articles) rather than everything
     available.
   - Handle the case where no relevant news exists for the window
     (common for quieter stocks) — this should produce a clean "no
     new information to assess" result, not an error or a forced verdict.

2. Thesis-relevance Inngest function
   - Build a new Inngest function (event-triggered, fired when the
     digest is computed for a flagged + thesis-bearing stock — not on
     every single page load, to control API usage) that:
     a. Takes the user's thesis text + the fetched news headlines/
        summaries + the Phase 5 explanation object (price move, volume,
        sector context) as input.
     b. Calls Gemini via step.ai.infer with a prompt that asks for a
        structured verdict: does this new information support,
        contradict, or not clearly affect the stated thesis — plus one
        concise sentence explaining why, per article/signal, and one
        overall one-line verdict.
     c. Require the model to respond in strict JSON only (as covered in
        your API guidance) so it can be parsed reliably — no preamble,
        no markdown fences. Parse defensively: if parsing fails, store
        a null/unavailable verdict rather than crashing or showing
        garbled text.
   - Store the result in change_events.thesis_verdict (already exists
     as a column from Phase 1) — store the verdict category plus a short
     structured payload (can go in the existing explanation jsonb, add a
     nested thesis_analysis key, don't create a new table for this).

3. Cost/rate control
   - This calls an LLM per flagged+thesis stock, so don't fire it
     redundantly — only run it once per (user, symbol, change_event),
     not on every digest reload. Check first whether a verdict already
     exists for this specific change event before calling the model
     again.
   - Cap how many thesis-relevance calls fire per digest load (e.g. only
     for Urgent-bucket stocks, or a max of 3-5 per load) — document this
     as a deliberate cost/latency trade-off, not a hidden limitation.

4. Digest UI integration
   - On a flagged stock's card (from Phase 6) that has a thesis, show
     the thesis text and the verdict clearly, e.g.:
     "Your thesis: EV growth + margin improvement" followed by
     "Thesis status: Mostly intact" (or Contradicted / Unclear /
     Not yet assessed while the async job runs).
   - Handle the in-flight state honestly: if the Inngest job hasn't
     finished yet when the digest first renders, show a clear "checking
     against your thesis..." state rather than blocking the whole page
     load on the AI call — the deterministic score/digest from Phases
     4-6 must always render immediately regardless of AI latency.
   - Expand the "why is this flagged?" detail view from Phase 6 to
     include the per-article/signal reasoning behind the thesis verdict,
     not just the one-line summary.

5. Editing thesis after the fact
   - Add a small UI affordance to edit an existing stock's thesis from
     the watchlist view (this was never built in Phase 2 — add it now
     since it's directly relevant to this phase). Editing a thesis
     should not retroactively rewrite past change_events verdicts —
     those stay historically accurate to what was assessed at the time.

WHAT NOT TO DO IN THIS PHASE
- Do not let the AI verdict influence the Phase 5 meaningfulness score
  or bucket — thesis relevance is a separate, additional layer shown
  alongside the deterministic score, never merged into it. This
  separation is a deliberate architectural decision you should be able
  to defend clearly.
- Don't call the AI for every stock on every load — only flagged,
  thesis-bearing stocks, and only once per change event (task 3).
- No fabricated confidence — if news data is thin, the verdict should
  say so plainly rather than the model inventing a confident-sounding
  answer from nothing.

---

MANUAL STEPS (must be done by you, not the AI/code)

1. Confirm your GEMINI_API_KEY is set and working (should already be
   configured if reused from the Signalist reference project) — test
   with a trivial Inngest AI call first if you haven't touched this
   integration yet.
2. Write and iterate on the actual prompt yourself — read several real
   outputs and judge whether the tone and reasoning sound like something
   a sharp analyst would say, not generic AI filler. This is worth real
   time; a bad prompt here undermines your best differentiator.
3. Watch your Gemini API usage/quota while testing, especially once
   you're triggering it repeatedly during development — free tiers have
   limits too.
4. Decide and write down, for your pitch, the exact reasoning for why
   AI is used here specifically and nowhere else in the scoring pipeline
   — you'll be asked this directly by judges, have the answer ready
   before demo day, not improvised on the spot.

---

TESTING — DO NOT MARK THIS PHASE DONE UNTIL ALL OF THESE PASS
1. Add a thesis to a stock, wait for it to become flagged (or use a
   stock you know is already flagged from Phase 5 testing) → confirm the
   Inngest job fires, a verdict appears, and it's stored correctly in
   change_events (check Supabase directly).
2. Reload the digest after a verdict already exists → confirm it does
   NOT re-trigger the AI call (verify via Inngest dev dashboard logs)
   and simply displays the stored verdict.
3. Test a flagged, thesis-bearing stock with genuinely no recent news →
   confirm it produces the clean "no new information" result rather than
   a hallucinated or forced verdict.
4. Test a non-flagged stock with a thesis → confirm no AI call fires for
   it at all (thesis check should only run for flagged stocks, per task
   1/3).
5. Test a flagged stock with no thesis → confirm no thesis section
   appears at all, no broken empty state.
6. Load the digest immediately after triggering a fresh flagged event →
   confirm the deterministic score/digest renders instantly while the
   thesis verdict shows "checking..." and then updates once ready,
   without blocking or freezing the page.
7. Manually break the Gemini API key temporarily → confirm the system
   degrades gracefully (verdict shows as unavailable, rest of the
   digest still works perfectly) rather than crashing anything.
8. Edit an existing thesis → confirm past change_events/verdicts remain
   unchanged historically, and confirm future flagged events use the
   new thesis text.
9. With 3+ flagged thesis-bearing stocks in one digest load, confirm the
   cap from task 3 is respected (check Inngest logs for call count) and
   observe roughly how long the full set takes to resolve.

Report back: what passed, what failed, a couple of real verdict examples
you're happy with (good demo material), and any deviations from spec,
before we move to Phase 8 (Resilience — staleness, conflicting sources,
confidence).