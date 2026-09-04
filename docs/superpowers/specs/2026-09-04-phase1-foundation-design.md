# Phase 1 — Foundation Design

**Date:** 2026-09-04
**Project:** Smart Market Watchlist (72-hour solo hackathon)
**Phase:** 1 of 9 — foundation only. No watchlist features, market data, or scoring logic.

## Goal

Deployable skeleton with working authentication and a database schema, so every later
phase builds on a solid, tested base.

## Stack

- Next.js 15 (App Router), TypeScript, Tailwind CSS
- Clerk — authentication
- Supabase — Postgres + Row Level Security
- Package manager: npm

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Supabase client | `@supabase/supabase-js` `createClient` with `accessToken` callback. No `@supabase/ssr`. | Clerk owns the session, not Supabase. Native third-party auth integration (Clerk JWT template deprecated April 2025). No Supabase auth cookies to manage. |
| Client factories | Three: server (RSC/actions), browser (client components), admin (service role). | Server + browser attach the Clerk token for RLS. Admin bypasses RLS for shared reference data writes. |
| Route protection | `clerkMiddleware` + `createRouteMatcher(['/dashboard(.*)','/debug(.*)'])` → `auth.protect()`. Plus `await auth.protect()` in `(protected)/layout.tsx`. | Route group `(protected)/` does not appear in the URL, so middleware matches concrete paths. Layout check is defense-in-depth. |
| Migrations | Plain numbered `.sql` files in `supabase/migrations/`, run manually in the Supabase SQL editor. Combined `schema.sql` for reference. | User chose no Supabase CLI dependency. Files give a schema record in git. |
| `user_id` column | `text not null default (auth.jwt()->>'sub')` on user-scoped tables. | Type `text` per Clerk/Supabase docs (Clerk `sub` is not a UUID). Default auto-fills the Clerk user ID on insert. |
| Env var names | `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (familiar names; equal to the newer publishable/secret keys). | Recognizable; both naming schemes work against Supabase. |

## Folder structure

```
app/
  layout.tsx                       root layout, <ClerkProvider>, <Header/>
  page.tsx                         public landing; link to /dashboard
  globals.css                      Tailwind directives
  (protected)/
    layout.tsx                     await auth.protect()
    dashboard/page.tsx             "Welcome, {firstName}"
    debug/page.tsx                 RLS / DB round-trip sanity check
  sign-in/[[...sign-in]]/page.tsx  <SignIn/>
  sign-up/[[...sign-up]]/page.tsx  <SignUp/>
components/
  header.tsx                       app name + <UserButton/> (signed in) / <SignInButton/> (signed out)
lib/
  supabase/server.ts               createServerSupabaseClient()
  supabase/client.ts               createBrowserSupabaseClient()
  supabase/admin.ts                createAdminSupabaseClient()  (server-only)
types/
  database.ts                      hand-written row types for the five tables
middleware.ts                      clerkMiddleware, protects /dashboard + /debug
supabase/migrations/
  0001_init.sql                    tables
  0002_rls.sql                     RLS enable + policies
supabase/schema.sql                full combined schema for reference
.env.example
README.md
```

## Auth flow

1. Unauthenticated request to `/dashboard` or `/debug` → middleware `auth.protect()` → redirect to `/sign-in`.
2. Sign-up / sign-in via Clerk hosted components at `/sign-up`, `/sign-in`. After auth → `/dashboard`.
3. `/dashboard` (server component): `currentUser()` → renders `Welcome, {user.firstName ?? user.username}`.
4. Header shows `<UserButton/>` when signed in (sign-out lives here), `<SignInButton/>` when signed out.

## Database schema

Five tables exactly as specified in `phase1.md`:

- `watchlist_items` — `id uuid pk default gen_random_uuid()`, `user_id text not null default (auth.jwt()->>'sub')`, `symbol text not null`, `thesis text`, `target_price numeric`, `added_at timestamptz not null default now()`, `unique(user_id, symbol)`.
- `market_snapshots` — `id uuid pk`, `symbol text not null`, `price numeric not null`, `volume bigint`, `source text not null`, `fetched_at timestamptz not null default now()`, `status text not null default 'FRESH'`.
- `user_seen_state` — `user_id text not null default (auth.jwt()->>'sub')`, `symbol text not null`, `last_seen_snapshot_id uuid references market_snapshots(id)`, `seen_at timestamptz not null default now()`, `primary key (user_id, symbol)`.
- `daily_history` — `symbol text not null`, `date date not null`, `close numeric not null`, `volume bigint`, `primary key (symbol, date)`.
- `change_events` — `id uuid pk default gen_random_uuid()`, `user_id text not null default (auth.jwt()->>'sub')`, `symbol text not null`, `detected_at timestamptz not null default now()`, `meaningfulness_score numeric`, `magnitude numeric`, `confidence text`, `explanation jsonb`, `thesis_verdict text`.

## RLS

- **User-scoped** (`watchlist_items`, `user_seen_state`, `change_events`): `enable row level security`. Four policies each — select / insert / update / delete — for role `authenticated`, predicate `(select auth.jwt()->>'sub') = user_id` (insert uses `with check`, update uses both `using` and `with check`).
- **Shared reference** (`market_snapshots`, `daily_history`): `enable row level security`. One policy: `for select to authenticated using (true)`. No insert/update/delete policies — only the service role (which bypasses RLS) can write.

## `/debug` sanity-check page

Protected server component. Runs a sequence with the server Supabase client (Clerk token attached) and renders each step's result as JSON:

1. `select *` from `watchlist_items` → expect `[]` (RLS scopes to caller).
2. `insert { symbol: 'TEST', thesis: 'phase1 sanity' }` — `user_id` auto-filled by column default.
3. `select *` again → show the inserted row.
4. `delete` where `symbol = 'TEST'` → confirm removal.

Proves auth + RLS + DB round-trip before real features are built. Temporary — removed in a later phase.

## Environment variables (`.env.example`)

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx
```

No real secrets committed. Real values go in `.env.local` (gitignored).

## README

- Prerequisites: Node 20+, npm, a Clerk account, a Supabase account.
- Numbered dashboard checklist:
  1. Create a Clerk application; copy publishable + secret keys.
  2. Create a Supabase project; copy project URL, anon key, service_role key.
  3. In the Supabase SQL editor, run `supabase/migrations/0001_init.sql` then `0002_rls.sql`.
  4. In Supabase → Authentication → Sign In / Providers → Third Party Auth, add Clerk; paste the Clerk domain from Clerk's "Connect with Supabase" page.
  5. Copy `.env.example` to `.env.local`; fill every value.
  6. `npm install` then `npm run dev`; open `http://localhost:3000`.
- Note: `/debug` is a temporary sanity check, removed in a later phase.

## Testing (phase not done until all pass)

1. Sign up as a new user → redirected to `/dashboard`, name displays.
2. Sign out → sign in → session persists, lands on `/dashboard`.
3. Visit `/dashboard` while signed out → redirected to sign-in.
4. `/debug`: insert row as User A, reads back, deletes.
5. User B cannot see or query User A's `watchlist_items` rows (RLS enforced, tested not assumed).
6. All five tables exist with correct columns/constraints — check `unique(user_id, symbol)` on `watchlist_items` and composite PK on `user_seen_state`.
7. Clean clone + `.env.example` filled with real secrets → dev server boots with no missing-config errors.

## Out of scope (Phase 1)

No stock search, market data fetching, or price display. No watchlist add/remove UI beyond `/debug`. No styling polish beyond a clean minimal layout. No scoring, digest, or thesis features.

## Division of labour

- **Claude:** all source files, SQL migrations, `.env.example`, README; runs `npm install` and boots the dev server to catch config errors.
- **User:** Clerk + Supabase dashboard setup, running the SQL migrations, filling `.env.local`, and the manual auth/RLS test walkthrough (tests 1–7) with real Clerk users.
