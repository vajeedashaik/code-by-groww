CONTEXT
I'm building a "smart market watchlist" web app for a 72-hour solo hackathon.
Stack: Next.js 15 (App Router), TypeScript, Tailwind CSS, Clerk (auth),
Supabase (Postgres + RLS). This is Phase 1 of 9 — foundation only. Do not
build watchlist features, market data fetching, or any scoring logic yet.

GOAL FOR THIS PHASE
Set up a working, deployable skeleton with authentication and a database
schema, so every later phase has a solid, tested base to build on.

TASKS

1. Project scaffold
   - Initialize a Next.js 15 project with App Router, TypeScript, Tailwind CSS.
   - Set up a clean folder structure: app/, components/, lib/, types/, and
     a (protected)/ route group for anything requiring auth.
   - Add a minimal, clean base layout (header with app name + user menu
     placeholder, empty main content area). Don't over-design yet — this
     is structure, not polish.

2. Auth (Clerk)
   - Integrate Clerk for sign-up/sign-in/sign-out.
   - Protect all routes under (protected)/ — unauthenticated users should
     be redirected to sign-in.
   - Add a simple authenticated landing page at /dashboard that just shows
     "Welcome, {user's name}" — proof auth works end to end.

3. Database (Supabase)
   - Set up the Supabase client (server + browser as needed).
   - Configure Clerk as a third-party auth provider for Supabase so RLS
     policies can use the Clerk user ID (auth.jwt() ->> 'sub' or the
     current recommended pattern — check Supabase's current docs for the
     Clerk integration, don't assume a specific syntax).
   - Create these tables with SQL migrations (not just via UI, so I have
     a record of the schema):

     watchlist_items (
       id uuid primary key default gen_random_uuid(),
       user_id text not null,
       symbol text not null,
       thesis text,
       target_price numeric,
       added_at timestamptz not null default now(),
       unique(user_id, symbol)
     )

     market_snapshots (
       id uuid primary key default gen_random_uuid(),
       symbol text not null,
       price numeric not null,
       volume bigint,
       source text not null,
       fetched_at timestamptz not null default now(),
       status text not null default 'FRESH'
     )

     user_seen_state (
       user_id text not null,
       symbol text not null,
       last_seen_snapshot_id uuid references market_snapshots(id),
       seen_at timestamptz not null default now(),
       primary key (user_id, symbol)
     )

     daily_history (
       symbol text not null,
       date date not null,
       close numeric not null,
       volume bigint,
       primary key (symbol, date)
     )

     change_events (
       id uuid primary key default gen_random_uuid(),
       user_id text not null,
       symbol text not null,
       detected_at timestamptz not null default now(),
       meaningfulness_score numeric,
       magnitude numeric,
       confidence text,
       explanation jsonb,
       thesis_verdict text
     )

   - Enable RLS on watchlist_items, user_seen_state, and change_events
     (the user-scoped tables). Write policies so a user can only
     select/insert/update/delete rows where user_id matches their own
     Clerk user ID. market_snapshots and daily_history are shared
     reference data — readable by any authenticated user, writable only
     by the service role (no user-facing writes).

4. Environment & config
   - Create a .env.example listing every required env var (Clerk keys,
     Supabase URL/keys) with placeholder values, no real secrets.
   - Add a README section documenting how to run the project locally.

5. Sanity-check page
   - Add a temporary /debug page (protected) that: fetches the current
     user's watchlist_items (should be empty), and does a test insert +
     read-back into watchlist_items using the logged-in user's ID, then
     deletes it. This proves auth + RLS + DB round-trip all work together
     before we build real features on top.

WHAT NOT TO DO IN THIS PHASE
- No stock search, no market data fetching, no price display.
- No watchlist add/remove UI beyond the /debug sanity check.
- No styling polish beyond a clean, minimal base layout.
- No scoring, no digest, no thesis features yet.

TESTING — DO NOT MARK THIS PHASE DONE UNTIL ALL OF THESE PASS
1. Sign up as a new user → redirected to /dashboard, name displays correctly.
2. Sign out → sign in again → session persists correctly, lands on /dashboard.
3. Try visiting /dashboard directly while signed out → redirected to sign-in.
4. On /debug: insert a test row into watchlist_items as User A, confirm it
   reads back correctly, then delete it.
5. Sign in as a second test user (User B) → confirm User B cannot see or
   query User A's watchlist_items rows (this proves RLS is actually
   enforced, not just assumed — test it, don't skip this).
6. Confirm all five tables exist in Supabase with the correct columns and
   constraints (check the unique constraint on watchlist_items and the
   composite primary key on user_seen_state specifically).
7. Restart the dev server from a clean clone using only .env.example +
   real secrets filled in — confirm it boots with no missing-config errors.

Report back: what passed, what failed, and any deviations you made from
this spec and why, before we move to Phase 2 (Watchlist CRUD).