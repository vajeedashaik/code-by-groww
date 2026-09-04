CONTEXT
Continuing the smart market watchlist project (Next.js 15 App Router,
TypeScript, Tailwind, Clerk, Supabase, Inngest). Phases 1-4 are complete:
auth/DB/RLS, watchlist CRUD, a live market data pipeline, and correct,
race-safe seen-state diffing producing raw price/volume deltas. This is
Phase 5 of 9 — the meaningfulness engine. This is the core intellectual
differentiator of the product: turning a raw price diff into a judgment
about whether it actually deserves attention. Do not build the digest UI
polish or thesis features yet — this phase is scoring logic only, though
you'll need a plain output to verify it against.

GOAL FOR THIS PHASE
Given a raw diff from Phase 4, compute a transparent, explainable
meaningfulness score by comparing the stock's move against its own
volatility, the broader market, and its sector — not raw % change alone.
Every score must come with a structured explanation of exactly which
factors contributed and why. Store results in change_events.

TASKS

1. Sector reference mapping
   - Create a small static mapping (e.g. lib/market-data/sectors.ts) of
     symbol -> sector for common NSE large-caps across ~5-6 sectors (IT,
     Banking, Auto, Pharma, FMCG, Energy) — around 5-6 representative
     stocks per sector is enough. This is a deliberate, documented
     trade-off (no reliable free sector-index API exists), not an
     oversight — say so in a comment.
   - Add a function to compute a synthetic sector benchmark: the average
     % move (from daily_history) of the reference stocks in a given
     sector over the relevant period. If a watchlisted symbol's sector
     isn't in your mapping, fall back to just the market benchmark and
     note reduced confidence (see task 4).

2. Market benchmark
   - Fetch/store Nifty 50 (^NSEI) as a symbol in the same data pipeline
     from Phase 3 (it can go through the same snapshot/daily_history
     tables — treat it as just another symbol, no special-casing needed
     in storage, only in how it's used).
   - Add a function to compute the market's % move over the same window
     as a given stock's diff.

3. Volatility normalization
   - Using daily_history, compute a rolling volatility measure per
     symbol (e.g. standard deviation of daily returns over the last
     ~20-30 days).
   - Convert a stock's raw price move into a z-score: how many standard
     deviations is this move from that stock's own normal daily
     variation. This is what makes a 2% move in a calm stock outrank a
     2% move in a stock that swings 5% daily — the core insight from our
     design doc, now actually implemented.
   - Handle the case where insufficient daily_history exists yet
     (e.g. a symbol added very recently) — fall back gracefully to raw
     % change with a flag indicating volatility-normalization wasn't
     possible, rather than crashing or dividing by zero.

4. Meaningfulness score
   - Combine into a single weighted score using clear, tunable, named
     weights (not magic numbers scattered in code) covering:
     - Price anomaly (the volatility z-score from task 3)
     - Volume anomaly (current volume vs its own recent average, from
       daily_history)
     - Market-relative movement (stock move minus market move — is it
       moving independently of the broader market?)
     - Sector-relative movement (stock move minus sector benchmark)
   - Attach a confidence level (High/Medium/Low) based on data
     completeness — e.g. Low if volatility couldn't be computed or
     sector mapping was missing, High if all inputs were available.
   - Write this as a pure, testable function (input: the raw diff +
     benchmarks + volatility; output: score + confidence + explanation)
     — no direct DB or API calls inside the scoring function itself,
     so it can be unit-tested in isolation.

5. Explanation object
   - Alongside the numeric score, produce a structured explanation
     (matches the change_events.explanation jsonb column) containing
     the individual factor values in plain terms, e.g.:
     { price_change_pct, price_zscore, volume_ratio, market_change_pct,
       sector_change_pct, sector_used, data_completeness }
   - This structured object is what Phase 6's "Why is this flagged?"
     view will render directly — keep field names stable and clear now
     so that phase is just UI work, not more logic.

6. Attention bucketing
   - Define score thresholds that bucket each change into Urgent /
     Notable / Routine. Pick initial thresholds, but treat them as
     tunable constants in one place, and plan to adjust them once you
     see real scores from real data (see manual steps below) — don't
     treat your first guess as final.

7. Persist and expose
   - On each watchlist view (or as part of the diff computation from
     Phase 4), compute the meaningfulness score for every symbol with a
     non-first-view diff, insert a row into change_events, and include
     the score/bucket/explanation in the existing diffs API response
     from Phase 4.
   - Skip scoring entirely for first-view symbols (task 4 of Phase 4
     already flags these) — there's nothing to score yet.

WHAT NOT TO DO IN THIS PHASE
- No digest UI redesign — extend the plain list from Phase 4 with the
  score/bucket shown as text, that's enough to verify correctness.
- No thesis logic.
- No news/corporate-event signals yet — this phase is price/volume/
  market/sector only. News integration comes with thesis in Phase 7.
- Don't over-tune the weights trying to be "correct" — pick reasonable
  values, document your reasoning, and treat them as a documented
  trade-off you can defend, not a solved optimization problem.

---

MANUAL STEPS (must be done by you, not the AI/code)

1. Review and adjust the sector mapping (task 1) — make sure it includes
   the specific stocks you plan to use in your demo, and that the
   sector groupings make sense to you.
2. Once real scores are flowing (task 7), manually look at several
   real examples across a few days of data and sanity-check them against
   your own judgment — does a genuinely news-driven move get scored
   higher than a market-wide rally? Adjust the weights/thresholds from
   tasks 4 and 6 based on what you actually observe, not just theory.
3. Decide your final bucket thresholds (task 6) after seeing real score
   distributions — write down what you chose and why, you'll need this
   for the "why this algorithm" answer in your pitch.
4. If you want a genuinely dramatic demo moment, consider manually
   watching for a real stock in your test watchlist that has an actual
   news-driven move during your build window, and use it as a real
   example in your demo instead of a fabricated one — far more
   convincing to judges.

---

TESTING — DO NOT MARK THIS PHASE DONE UNTIL ALL OF THESE PASS
1. Unit-test the scoring function directly (not through the UI) with
   two constructed scenarios mirroring our design doc: (a) a stock that
   moved +7% but sector +6%, market +5%, normal volume → should score
   low/Routine; (b) a stock that moved +3% but sector +0.2%, market
   +0.1%, volume 4x normal → should score high/Urgent. Confirm the
   engine produces the correct relative ranking between these two.
2. Test a symbol with less than ~20 days of daily_history → confirm it
   falls back gracefully (flagged low confidence, raw % used) instead of
   crashing or producing NaN/Infinity.
3. Test a symbol not present in your sector mapping → confirm it falls
   back to market-only comparison with reduced confidence, not a crash.
4. Test zero volume or missing volume data → confirm volume anomaly
   calculation handles this without dividing by zero.
5. Confirm change_events rows are created correctly with a valid,
   readable explanation jsonb object — inspect a few directly in
   Supabase.
6. Confirm the diffs API from Phase 4 now includes score/bucket/
   explanation for every non-first-view symbol, and that first-view
   symbols correctly have none.
7. With a watchlist of 10+ real stocks, reload and confirm scores
   compute for all of them without errors or excessive slowdown — this
   is your "how does it scale for larger watchlists" evidence, so time
   it and note roughly how long it takes.
8. Manually inspect at least 3 real (non-constructed) scored examples
   from your actual test watchlist and confirm the bucket assignment
   matches your own intuitive judgment of how meaningful each move is.

Report back: what passed, what failed, the actual weights/thresholds you
landed on and why, and any deviations from spec, before we move to
Phase 6 (the "While You Were Away" digest UI) — this is where all of
this scoring work finally becomes visible and demoable.