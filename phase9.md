CONTEXT
Continuing the smart market watchlist project (Next.js 15 App Router,
TypeScript, Tailwind, Clerk, Supabase, Inngest, Gemini). Phases 1-8 are
complete: auth/DB/RLS, watchlist CRUD, market data pipeline, race-safe
diffing, the meaningfulness engine, the digest UI, thesis-relevance
checking, and resilience/staleness/conflict handling. This is Phase 9 of
9 — the final phase before submission. No new product logic should be
built here unless something is genuinely broken. This phase is about
making everything that exists demonstrably solid, visually confident,
and clearly explainable to judges who have limited time per team.

GOAL FOR THIS PHASE
A judge can open the product cold, understand what it does within
seconds, watch a clean end-to-end demo with no visible bugs, and read a
short written explanation of the key decisions if they want depth beyond
the demo. Nothing new is added — everything that exists is verified,
tightened, and presented well.

TASKS

1. Full regression pass across every phase
   - Go through every "TESTING" checklist from Phases 1-8 again, in
     order, against the current final state of the app — not just the
     phase it was written for. Later phases can silently break earlier
     ones (a UI refactor in Phase 6 breaking a Phase 4 flow, for
     example). Fix anything that regressed before doing anything else
     in this phase.
   - Pay special attention to the concurrency/idempotency tests (Phase
     1's RLS cross-user test, Phase 4's rapid-refresh test) — these are
     easy to silently break during later UI work and are exactly what a
     sharp judge will probe.

2. Visual polish pass
   - Now that all content genuinely exists (digest, explainability view,
     thesis verdicts, staleness badges, time machine), do one focused
     design pass: consistent spacing/type scale across all views, a
     coherent color system (not ad-hoc colors added phase by phase),
     consistent empty/loading/error states across every screen, and a
     simple, confident landing/sign-in experience since that's the very
     first thing a judge sees.
   - Do not restructure features here — this is visual refinement of
     what's already built and tested, not new design decisions.

3. Performance check at realistic scale
   - Test with a watchlist of 30-50 stocks (the upper end of what the
     brief implies) — confirm the digest loads in a reasonable time,
     the diffs API (Phase 4) stays a single batched call not N+1, and
     the meaningfulness scoring (Phase 5) doesn't visibly slow the page.
     Note actual load times — you'll want real numbers, not vague
     claims, for your "how does it scale" answer.
   - Confirm the snapshot job (Phase 3) can handle this many symbols
     within your chosen polling interval without falling behind or
     hitting rate limits — if it can't, document the real bottleneck and
     your planned fix as a "next steps at scale" talking point, rather
     than silently ignoring it.

4. Error boundary / crash safety sweep
   - Confirm there's a top-level error boundary so no single broken
     component can white-screen the entire app during a live demo.
   - Deliberately try to break things a judge might try: navigating
     directly to a protected URL while logged out, adding a stock twice
     quickly, removing a stock while its digest card is expanded,
     going back/forward in browser history mid-flow.

5. Documentation for judges
   - Write a concise README (not the full internal design doc — a
     judge-facing summary) covering: what the product does in 2-3
     sentences, the core insight (memory + attention, not another
     dashboard), how to run it locally, and a short "key decisions"
     section answering the questions from your original design doc's
     "Judge-Facing Engineering Story" section (why this architecture,
     why this meaningfulness algorithm, how staleness/conflicts are
     handled, why not microservices, why AI only for thesis-relevance)
     — these should now reference real, built behavior, not
     aspirational plans.
   - Include your actual final numbers where you have them: your chosen
     polling interval, sector mapping trade-off, bucket thresholds, and
     the Phase 8 performance numbers.

6. Demo script
   - Write out the actual demo flow as a short script following the
     narrative structure from the original design doc (the problem →
     user leaves → the return → explain one change → thesis → reliability
     → closing line), using real screenshots or a real walkthrough of
     your actual test data, not a hypothetical example.
   - Time it — aim for a demo that comfortably fits whatever time limit
     you're given, with room to answer 1-2 follow-up questions.

7. Deployment (if required/desired)
   - If the hackathon requires a live link rather than a local demo,
     deploy to Vercel (or your chosen host), wire up production env vars
     for Clerk/Supabase/Finnhub/Gemini, and register Inngest functions
     with Inngest Cloud so scheduled jobs actually run in production, not
     just locally.
   - If deploying, re-run the core regression tests (task 1) against the
     deployed version specifically — local and production environments
     can behave differently (env vars, cold starts, cron registration).

WHAT NOT TO DO IN THIS PHASE
- No new features, even small ones that seem quick — the risk of
  breaking something stable this close to submission outweighs the
  benefit, and it's not what this phase is for.
- Don't rewrite the meaningfulness weights or thresholds here unless
  the Phase 5 manual sanity-check genuinely never happened — that
  belongs in Phase 5, not last-minute here.
- Don't add features from the P2/P3 list we deprioritized earlier
  (notifications, sharing, custom preferences) — if there's leftover
  time after everything above, spend it rehearsing the demo, not
  expanding scope.

---

MANUAL STEPS (must be done by you, not the AI/code)

1. Actually rehearse the demo out loud at least twice, ideally in front
   of someone else, timed — this reveals awkward transitions and
   confusing moments that reading a script silently never does.
2. Prepare short, honest answers to the likely hard questions before
   you're asked them live: "why didn't you build X," "how would this
   scale to 100k users," "why trust an LLM for the thesis check but not
   the score" — write 1-2 sentence answers for each and actually read
   them over, don't improvise these under pressure.
3. Double-check every API key/secret used in the deployed version (if
   deploying) is valid and not close to a rate limit right before your
   actual presentation slot — a dead API key mid-demo is a completely
   avoidable failure.
4. Take final screenshots/a short screen recording of the working demo
   as a backup in case live internet/deployment issues occur during
   the actual presentation — always have a fallback that doesn't depend
   on live infrastructure working perfectly in the room.
5. Re-read your original design doc's sections 34-39 (guiding principles,
   final product definition, success definition) right before your
   presentation — they're genuinely well-written and worth having fresh
   in mind for how you frame the pitch verbally.

---

TESTING — DO NOT MARK THIS PHASE DONE UNTIL ALL OF THESE PASS
1. Every checklist item from Phases 1-8 re-verified against the final
   build, not just the phase it originally belonged to.
2. Cold-start test: close the browser entirely, clear any local session,
   open the app fresh, sign in, and walk the full demo flow start to
   finish with no errors and no confusing states.
3. The 30-50 stock performance test from task 3 completed with real
   numbers recorded.
4. Every deliberate "break it" attempt from task 4 handled gracefully,
   with no white screen and no unrecoverable state.
5. The full demo script rehearsed at least twice, fits comfortably
   within your time limit.
6. If deployed: the production URL walked through end-to-end exactly
   like the local regression, with no environment-specific failures.
7. README reviewed by re-reading it as if you're a judge seeing this
   project for the first time — does it clearly explain what makes this
   different within the first few lines, or does it bury the insight?

Report back: final state of the project, any known remaining issues
(and whether they're acceptable to ship with or need a quick fix), and
whether the demo script feels ready.