CONTEXT
Continuing the smart market watchlist project (Next.js 15 App Router,
TypeScript, Tailwind, Clerk, Supabase, Inngest). Phases 1-3 are complete:
auth/DB/RLS, watchlist CRUD, and a live market data pipeline writing to
market_snapshots and daily_history on a schedule. This is Phase 4 of 9 —
seen-state tracking and raw diffing. This phase completes the P0 minimum
requirement ("return later and see what has changed"). Do not build the
meaningfulness engine, scoring, sector/market comparison, or the polished
digest UI yet — this phase is about correctly capturing and computing
raw change, not judging its importance.

GOAL FOR THIS PHASE
The system correctly remembers, per user per symbol, which snapshot they
last saw. When they return, it can compute a correct raw diff (price
change, volume change, time elapsed) between what they last saw and what
is current — safely, even under concurrent requests or rapid repeated
visits, with no duplicate or corrupted state.

TASKS

1. "Mark as seen" logic
   - Build a server action / API route: when a user views their
     watchlist, for each symbol in it, upsert a row into
     user_seen_state (user_id, symbol) with last_seen_snapshot_id set to
     the *current latest* market_snapshots.id for that symbol, and
     seen_at = now().
   - This must be idempotent: calling it multiple times in a row (rapid
     refresh, double-click, network retry) must not create duplicate
     rows or corrupt state — rely on the composite primary key
     (user_id, symbol) from Phase 1 and use a proper upsert
     (insert ... on conflict do update), not a naive insert.

2. Race condition handling
   - Consider this sequence explicitly: user opens the watchlist (reads
     snapshot A as "current"), a new snapshot B is written by the
     background job a moment later, then the "mark as seen" request from
     the original page load fires and tries to write snapshot A as
     last-seen. This must not silently discard the fact that B exists as
     unseen — decide and implement one clear policy (for example: always
     mark-as-seen against whatever snapshot was actually current at the
     moment the write happens, re-queried server-side, not whatever the
     client originally loaded) and write a short comment explaining the
     choice.
   - Do not let two near-simultaneous "mark as seen" calls for the same
     (user, symbol) leave the row in an inconsistent state — the upsert
     with a proper unique constraint should already guarantee this, but
     verify it under the concurrency test below rather than assuming it.

3. Diff computation
   - Build a function: given a user_id and symbol, look up
     user_seen_state to find the last_seen_snapshot_id, fetch that
     snapshot and the current latest snapshot, and return a structured
     raw diff: price_then, price_now, price_delta, price_delta_pct,
     volume_then, volume_now, time_elapsed, and a flag for whether this
     is the user's first-ever view of this symbol (no prior seen-state
     exists).
   - Handle the first-time-view case explicitly and cleanly — there is
     no "before" to diff against, so return a distinct state
     (e.g. is_first_view: true) rather than a fake zero-delta.
   - This function is what Phase 5's meaningfulness engine will consume
     as its raw input — keep its output clean and well-typed.

4. Expose diffs via API
   - Add an endpoint (e.g. GET /api/watchlist/diffs) that returns the
     raw diff for every symbol in the current user's watchlist in one
     call, rather than one request per symbol — this matters for the
     "larger watchlists" scalability consideration, avoid N+1 queries
     here (a single query joining/batching across the user's
     watchlist_items and the relevant snapshots, not a loop of
     individual lookups).

5. Minimal UI wiring (functional, not polished — polish comes in Phase 6)
   - On the /watchlist page, when it loads: fetch and display the raw
     diff per stock (e.g. "+2.3% since you last checked, 4 hours ago")
     alongside the current price from Phase 3.
   - After the page has loaded and diffs are displayed, trigger the
     "mark as seen" call so the *next* visit correctly diffs from this
     point forward. Be deliberate about timing this after the diff is
     computed and shown, not before — marking as seen before showing the
     diff would erase the very change you're trying to display.

WHAT NOT TO DO IN THIS PHASE
- No scoring/ranking of how "meaningful" a change is — raw numeric diff
  only, that's Phase 5's job.
- No sector/market comparison yet.
- No visual digest design — a plain, readable list is enough for now.
- Don't add thesis logic here — that's Phase 7.

---

MANUAL STEPS (must be done by you, not the AI/code)

1. To actually test the race-condition scenario in task 2, you'll need
   to manually trigger the Phase 3 snapshot job (via the Inngest dev
   dashboard) at a specific moment while a watchlist page is open in the
   browser — time this yourself during testing, it can't be fully
   automated in a quick check.
2. Manually inspect the user_seen_state table in Supabase after each
   test scenario below to visually confirm exactly one row per
   (user, symbol), not by trusting the UI alone.
3. Decide how "last checked" time should be phrased in the UI (e.g.
   "4 hours ago" vs an exact timestamp) — this is a small product call
   worth making deliberately since it sets tone for Phase 6's digest.

---

TESTING — DO NOT MARK THIS PHASE DONE UNTIL ALL OF THESE PASS
1. Add a brand-new stock, view /watchlist immediately → confirm it shows
   the first-time-view state correctly (no fake diff, no crash).
2. View the same watchlist again a moment later, with no new snapshot
   written in between → confirm the diff now correctly shows "0 change"
   against the previously seen snapshot, not another first-view state.
3. Manually trigger the Phase 3 snapshot job to create a new price →
   reload /watchlist → confirm the diff now correctly reflects the price
   difference between the old seen snapshot and the new one.
4. Reload /watchlist rapidly several times in a row (double-click
   refresh, or refresh 5x quickly) → check user_seen_state in Supabase →
   confirm exactly one row exists per (user, symbol), not duplicates or
   errors.
5. Open /watchlist, and before it finishes loading, manually trigger a
   new snapshot via the Inngest dashboard, then let the page finish
   loading and mark-as-seen fire → confirm the seen-state ends up
   pointing at a real, consistent snapshot (not corrupted, not pointing
   at a snapshot that doesn't exist) — check this directly in Supabase.
6. Confirm GET /api/watchlist/diffs returns all symbols' diffs in a
   single response (check network tab — should be one request, not one
   per symbol) even with 10+ stocks in the watchlist.
7. Sign in as User B → confirm their seen-state is completely independent
   of User A's (same symbol watched by both users should have two
   separate user_seen_state rows with potentially different
   last_seen_snapshot_id values).
8. Remove a stock from the watchlist (Phase 2 flow) → confirm its
   user_seen_state row is either cleaned up or correctly ignored (your
   choice — decide and document which, then verify it doesn't cause
   errors or ghost entries in the diff API).

Report back: what passed, what failed, which race-condition policy you
implemented and why, and any deviations from spec, before we move to
Phase 5 (Meaningfulness Engine) — this is the core of your differentiator,
so Phase 4 needs to be genuinely solid first.