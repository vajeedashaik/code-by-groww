# Smart Market Watchlist

Smart market watchlist web app. **Phases 1–2 complete**: authentication
(Clerk), database schema (Supabase + RLS), and per-user watchlist CRUD with
stock search. No live prices, scoring, digest, or thesis usage yet.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Clerk · Supabase ·
Finnhub (stock search).

## Prerequisites

- Node 20+ and npm
- A [Clerk](https://dashboard.clerk.com) account
- A [Supabase](https://supabase.com/dashboard) project

## Setup

### 1. Clerk application

1. Create an application in the Clerk dashboard.
2. **API Keys** → copy the **Publishable key** and **Secret key**.

### 2. Supabase project

1. Create a project in the Supabase dashboard.
2. **Project Settings → API** → copy the **Project URL**, the **anon / publishable**
   key, and the **service_role / secret** key.

### 3. Run the migrations

In the Supabase **SQL Editor**, run these files in order:

1. `supabase/migrations/0001_init.sql` — creates the five tables.
2. `supabase/migrations/0002_rls.sql` — enables RLS and adds policies.
3. `supabase/migrations/0003_watchlist_company_name.sql` — adds
   `watchlist_items.company_name` (Phase 2).

(`supabase/schema.sql` is the same content combined, for reference only.)

### 4. Wire Clerk as a third-party auth provider for Supabase

Uses Clerk's **native** Supabase integration (the JWT template is deprecated).

1. In Supabase: **Authentication → Sign In / Providers → Third Party Auth** →
   **Add provider → Clerk**.
2. Open the "Connect with Supabase" page linked in that modal (it goes to Clerk),
   pick this Clerk app, enable the integration, and copy the **Clerk domain** it
   shows.
3. Paste that domain into the Supabase provider settings and save.

RLS policies read the Clerk user id from `auth.jwt() ->> 'sub'`. The app's
Supabase clients attach the Clerk session token via the `accessToken` option
(see `lib/supabase/`).

### 5. Environment variables

```bash
cp .env.example .env.local
```

Fill every value in `.env.local` from steps 1–2, plus a free
[Finnhub](https://finnhub.io) API key as `FINNHUB_API_KEY` (Phase 2 stock
search; search falls back to a static NSE list if it's missing). `.env.local`
is gitignored — never commit real keys.

### 6. Run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Routes

| Path         | Access        | Purpose                                             |
| ------------ | ------------- | -------------------------------------------------- |
| `/`          | public        | Landing page                                       |
| `/sign-in`   | public        | Clerk sign-in                                      |
| `/sign-up`   | public        | Clerk sign-up                                      |
| `/dashboard` | authenticated | "Welcome, {name}" — proof auth works               |
| `/watchlist` | authenticated | Stock search + per-user watchlist CRUD (Phase 2)    |
| `/debug`     | authenticated | **temporary** — auth + RLS + DB round-trip check   |
| `/api/search`| authenticated | JSON stock search (Finnhub + static NSE fallback)   |

Unauthenticated requests to `/dashboard`, `/watchlist`, or `/debug` redirect to
sign-in (`middleware.ts`); `/api/search` returns `401`.

## Project layout

```
app/
  layout.tsx              root layout, ClerkProvider, header
  page.tsx                public landing
  (protected)/            route group — auth.protect() gate
    dashboard/page.tsx
    debug/page.tsx
    watchlist/page.tsx    watchlist view + add form
    watchlist/actions.ts  add / remove server actions
  api/search/route.ts     stock search (Finnhub + NSE fallback)
  sign-in/, sign-up/      Clerk components
components/header.tsx     app name + user menu
components/watchlist/     add-stock + remove-stock-button client components
lib/hooks/use-debounce.ts  debounced value hook (search input)
lib/stocks/              NSE fallback list, search types
lib/supabase/             server / browser / admin clients
types/database.ts         hand-written row types
middleware.ts             Clerk middleware, protects /dashboard + /watchlist + /debug
supabase/migrations/      versioned SQL — run in the dashboard
```

## Scripts

| Command             | What                              |
| ------------------- | --------------------------------- |
| `npm run dev`       | dev server                        |
| `npm run build`     | production build                  |
| `npm run start`     | serve the production build        |
| `npm run typecheck` | `tsc --noEmit`                    |

## Phase 2 acceptance tests

1. Search "Infosys" or "TCS" → relevant results appear.
2. Search "zzxxqq123" → clean empty state, no crash.
3. Add a stock with a thesis → shows in `/watchlist` with the thesis text.
4. Add a stock with no thesis → shows with no thesis line (no "null"/"undefined").
5. Add the same stock twice → clear message, no duplicate row in Supabase.
6. Remove a stock → confirm step, then it's gone from `/watchlist` and the DB.
7. User B's watchlist is empty and independent of User A's.
8. Full reload → watchlist state persists.
9. Break `FINNHUB_API_KEY` → search degrades to the static NSE list with a
   warning; the rest of the app is unaffected.

## Phase 1 acceptance tests

1. Sign up → redirected to `/dashboard`, name shows.
2. Sign out → sign in → session persists, lands on `/dashboard`.
3. Visit `/dashboard` while signed out → redirected to sign-in.
4. `/debug` as User A: insert TEST row, reads back, deletes.
5. User B cannot see or query User A's `watchlist_items` rows (RLS enforced).
6. All five tables exist with correct columns/constraints — check
   `unique(user_id, symbol)` on `watchlist_items` and the composite PK on
   `user_seen_state`.
7. Fresh clone + `.env.local` filled → `npm run dev` boots with no
   missing-config errors.
