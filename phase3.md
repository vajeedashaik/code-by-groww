CONTEXT
Continuing the smart market watchlist project (Next.js 15 App Router,
TypeScript, Tailwind, Clerk, Supabase, Inngest). Phase 1 (auth/DB/RLS)
and Phase 2 (watchlist CRUD) are complete and tested. This is Phase 3
of 9 — market data ingestion only. Do not build the meaningfulness
engine, scoring, the "while you were away" digest, or thesis features
yet. The only goal here is: real prices flowing into market_snapshots
and daily_history, reliably, on a schedule, with honest handling of
failures.

GOAL FOR THIS PHASE
A scheduled background job fetches current prices for every distinct
symbol across all users' watchlists, stores them as snapshots with
source/status metadata, and separately backfills daily historical data
needed later for volatility and sector-benchmark calculations. The
watchlist page from Phase 2 now shows real, live-ish prices instead of
the placeholder.

TASKS

1. Data source integration
   - Add the `yahoo-finance2` npm package as the primary market data
     source. It supports NSE tickers directly (e.g. RELIANCE.NS,
     TCS.NS) and has no hard published daily quota, unlike Alpha
     Vantage's free tier.
   - Add Finnhub (already integrated in Phase 2 for search) as a
     secondary source, used for: (a) US-listed symbols if any are added,
     and (b) as a cross-check source for a small subset of symbols to
     genuinely exercise the conflict-handling logic later — don't fake
     conflicts, but make sure the architecture supports two real sources
     disagreeing.
   - Build a thin data-adapter layer (e.g. lib/market-data/) that
     abstracts "get current quote for symbol" and "get daily history for
     symbol" behind a common interface, regardless of which underlying
     source answers. This isolation is the point — business logic later
     should never call yahoo-finance2 or Finnhub directly.

2. Snapshot ingestion job (Inngest)
   - Create an Inngest scheduled function (cron, e.g. every 5 minutes)
     that:
     a. Queries Supabase for the distinct set of symbols currently in
        any watchlist_items row (service role, not user-scoped — this
        is shared reference data).
     b. Fetches a current quote for each symbol via the adapter layer.
     c. Inserts a new row into market_snapshots per symbol with price,
        volume, source, fetched_at, and status = 'FRESH'.
     d. If a fetch fails for a symbol (API error, symbol not found,
        timeout), do not crash the whole job — log the failure, skip
        that symbol, and continue with the rest. Partial failure must
        not block the batch.
   - Batch/throttle requests sensibly so you don't hammer the data
     source — process symbols in small chunks with brief delays between
     chunks rather than firing everything in parallel.

3. Staleness detection
   - Add a lightweight function that, given a symbol, determines status
     from the most recent snapshot's age: FRESH (<2 min), DELAYED
     (2–10 min), STALE (>10 min). This won't be surfaced in the UI until
     Phase 8, but compute and store it now so the data exists.
   - This means status on market_snapshots isn't just "what we fetched"
     — it should be recalculated relative to fetch time, since a snapshot
     that was FRESH when written becomes STALE later if no new fetch
     replaces it.

4. Daily history backfill job (Inngest)
   - A separate Inngest scheduled function (once per day, or manually
     triggerable) that fetches daily historical closes (~30-60 days) for
     every distinct watchlisted symbol and upserts into daily_history.
   - This is what Phase 5's volatility and sector-benchmark calculations
     will read from — get it populated now so there's real data to test
     against later.

5. Wire real prices into the watchlist UI
   - Update the /watchlist page from Phase 2 to show the latest
     market_snapshot price and % change (vs previous close from
     daily_history) per symbol instead of the placeholder text.
   - If no snapshot exists yet for a symbol (e.g. just added, job hasn't
     run), show a clear "fetching price..." state, not a broken UI.

6. Manual trigger for testing
   - Add a protected dev-only route or Inngest dev-server trigger that
     lets you manually fire the snapshot job on demand, so you don't
     have to wait for the cron interval while testing.

WHAT NOT TO DO IN THIS PHASE
- No scoring, no meaningfulness engine, no sector/market comparison logic
  yet — just get raw data flowing and stored correctly.
- No UI for staleness badges yet (Phase 8) — just compute and store the
  data.
- Don't try to handle every possible data-source edge case exhaustively;
  handle the realistic ones (symbol not found, timeout, rate limit) and
  move on.

---

MANUAL STEPS (must be done by you, not the AI/code)

1. Run `npx inngest-cli@latest dev` locally alongside `npm run dev` so
   scheduled/background functions actually execute in development —
   Inngest functions won't run without this.
2. Manually trigger the snapshot job at least once via the Inngest dev
   dashboard (usually http://localhost:8288) and visually confirm rows
   appear in market_snapshots in Supabase.
3. Watch your Finnhub usage dashboard while testing to confirm you're
   not approaching rate limits, especially once both the snapshot job
   and daily history job are running.
4. Decide and note down your actual polling interval (5 minutes is a
   starting suggestion) based on how many symbols are in your test
   watchlists and how the data source responds — adjust if needed and
   tell me what you land on, since it affects the staleness thresholds
   in step 3.
5. If deploying anywhere before the hackathon deadline (e.g. Vercel),
   you'll need to separately register your Inngest functions with
   Inngest Cloud and set the relevant env vars — this isn't needed for
   local dev/demo but flag it to me if you plan to deploy live.

---

TESTING — DO NOT MARK THIS PHASE DONE UNTIL ALL OF THESE PASS
1. Manually trigger the snapshot job → confirm new rows appear in
   market_snapshots for every symbol currently in any watchlist.
2. Add a new, previously-untracked stock to a watchlist (Phase 2 flow)
   → trigger the job again → confirm a snapshot now exists for that
   symbol too (proves the job reads watchlist_items dynamically, not a
   hardcoded list).
3. Temporarily use an invalid/nonsense symbol in a test watchlist item
   directly in Supabase → trigger the job → confirm it logs/skips that
   symbol gracefully and still successfully processes all other symbols
   (this is the partial-failure requirement — don't skip this test).
4. Trigger the daily history job → confirm daily_history has multiple
   days of real closing prices per symbol, not just one row.
5. Reload /watchlist → confirm real prices and % change display
   correctly for stocks that have snapshots.
6. Add a brand-new stock and immediately view /watchlist before the job
   has run → confirm the "fetching price..." state shows cleanly, no
   crash, no fake zero/blank price.
7. Manually insert an old market_snapshots row (fetched_at set to e.g.
   20 minutes ago) for one symbol and confirm your staleness function
   correctly classifies it as STALE when queried — even though nothing
   in the UI shows this yet, verify the logic itself is correct.
8. Restart both `npm run dev` and `inngest dev` from a clean state →
   confirm the scheduled job is registered and fires on its own without
   manual triggering (give it enough time to hit the interval, or trust
   the manual trigger if you don't want to wait).

Report back: what passed, what failed, your actual chosen polling
interval, and any deviations from spec and why, before we move to
Phase 4 (Seen-State & Diffing).