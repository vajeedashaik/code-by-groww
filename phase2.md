CONTEXT
Continuing the smart market watchlist project (Next.js 15 App Router,
TypeScript, Tailwind, Clerk, Supabase). Phase 1 (auth + DB schema + RLS)
is complete and tested. This is Phase 2 of 9 — watchlist management only.
Do not build live price polling, the meaningfulness engine, the "while
you were away" digest, or thesis features yet.

GOAL FOR THIS PHASE
A user can search for a real stock, add it to their watchlist with an
optional thesis, see their watchlist, and remove items — fully persisted
per-user in Supabase, protected by the RLS policies from Phase 1.

TASKS

1. Stock search
   - Add a server action / API route that searches for stocks by symbol
     or company name using the Finnhub search endpoint
     (https://finnhub.io/api/v1/search).
   - Scope this to Indian equities where possible — Finnhub's coverage
     of NSE/BSE is limited on the free tier, so also support a small
     static fallback list of common NSE symbols (e.g. RELIANCE.NS,
     TCS.NS, INFY.NS, HDFCBANK.NS, TATAMOTORS.NS — pick ~30-40 liquid,
     well-known names across sectors) that the user can search/filter
     locally even if the external API doesn't return them. Document this
     limitation clearly in a code comment — it's a deliberate trade-off,
     not an oversight.
   - Debounce the search input (there's a working debounce hook pattern
     in the Signalist reference project you can adapt).

2. Add to watchlist
   - UI: a search box + results dropdown; selecting a result opens a
     small form with an optional "Why are you watching this?" free-text
     field (this becomes the `thesis` column — store it now even though
     we don't use it until Phase 7, so the data exists when we need it)
     and an optional target price.
   - Server action: insert into watchlist_items scoped to the current
     Clerk user ID. Handle the case where the symbol is already in the
     user's watchlist gracefully (don't error ugly — show a clear message,
     rely on the unique(user_id, symbol) constraint from Phase 1).

3. View watchlist
   - A /watchlist page (protected) listing all of the current user's
     watchlist_items: symbol, company name (from search metadata or a
     lookup), thesis if present, added date.
   - No live price yet — that's Phase 3. Show a clear placeholder like
     "price data coming soon" or similar rather than a fake number.

4. Remove from watchlist
   - Delete button per item, with a confirmation step (don't allow
     accidental one-click deletes).
   - Server action scoped to the current user; rely on RLS as the backstop,
     but also explicitly filter by user_id in the query itself — don't
     depend on RLS alone for correctness, treat it as defense in depth.

5. Input validation & edge cases
   - Reject empty/whitespace-only symbols.
   - Handle the Finnhub API being down or rate-limited: show a clear
     "search temporarily unavailable" state rather than crashing.
   - Handle a user with zero watchlist items: proper empty state, not
     a blank page.
   - Handle a user attempting to add more than ~50 stocks: allow it, but
     note in a comment that this is the scale we're designing for.

WHAT NOT TO DO IN THIS PHASE
- No price fetching, no scoring, no digest.
- No thesis *usage* — just persist the field, nothing reads it yet.
- Don't build out full company profile pages — symbol + name is enough
  for this phase.

---

MANUAL STEPS (must be done by you, not the AI/code)

1. Sign up for a free Finnhub API key at https://finnhub.io if you
   haven't already, and add it to your local .env as FINNHUB_API_KEY.
2. Confirm the static NSE fallback symbol list (step 1 above) actually
   covers stocks you plan to demo with — add/edit the list yourself if
   you want specific companies guaranteed to be searchable.
3. Manually test the debounce feel in the browser (not just correctness)
   — type quickly in the search box and confirm it doesn't feel laggy
   or fire excessive requests. Adjust the debounce delay if it feels off.
4. Manually check your Finnhub dashboard/usage page after testing to
   confirm you're not close to rate limits before Phase 3 adds scheduled
   polling on top of this.

---

TESTING — DO NOT MARK THIS PHASE DONE UNTIL ALL OF THESE PASS
1. Search for a well-known stock (e.g. "Infosys" or "TCS") → relevant
   results appear.
2. Search for a nonsense string ("zzxxqq123") → clean empty state, no
   crash.
3. Add a stock with a thesis filled in → appears correctly in /watchlist
   with the thesis text intact.
4. Add a stock with no thesis → appears correctly with no thesis shown
   (not "null" or "undefined" rendered in the UI).
5. Try adding the same stock twice → clear message, no duplicate row in
   the database (verify directly in Supabase).
6. Remove a stock → confirmation step works, item disappears from
   /watchlist and from the database.
7. Sign in as User B (from Phase 1's test) → confirm User B's watchlist
   is empty and independent of User A's — add/remove on one account must
   not affect the other.
8. Refresh the page and fully reload the app → watchlist state persists
   correctly (this is the actual point of Phase 1's DB work — confirm it
   holds up here).
9. Temporarily break the Finnhub API key (wrong value) → confirm search
   fails gracefully with a clear error state, rest of the app still works.

Report back: what passed, what failed, and any deviations from spec and
why, before we move to Phase 3 (Market Data Pipeline).