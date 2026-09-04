# Smart Market Watchlist

Smart market watchlist web app. **Phase 1 — foundation only**: authentication
(Clerk) and database schema (Supabase + RLS). No market data, watchlist UI, or
scoring yet.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Clerk · Supabase.

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

In the Supabase **SQL Editor**, run these two files in order:

1. `supabase/migrations/0001_init.sql` — creates the five tables.
2. `supabase/migrations/0002_rls.sql` — enables RLS and adds policies.

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

Fill every value in `.env.local` from steps 1–2. `.env.local` is gitignored —
never commit real keys.

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
| `/debug`     | authenticated | **temporary** — auth + RLS + DB round-trip check   |

Unauthenticated requests to `/dashboard` or `/debug` redirect to sign-in
(`middleware.ts`).

## Project layout

```
app/
  layout.tsx              root layout, ClerkProvider, header
  page.tsx                public landing
  (protected)/            route group — auth.protect() gate
    dashboard/page.tsx
    debug/page.tsx
  sign-in/, sign-up/      Clerk components
components/header.tsx     app name + user menu
lib/supabase/             server / browser / admin clients
types/database.ts         hand-written row types
middleware.ts             Clerk middleware, protects /dashboard + /debug
supabase/migrations/      versioned SQL — run in the dashboard
```

## Scripts

| Command             | What                              |
| ------------------- | --------------------------------- |
| `npm run dev`       | dev server                        |
| `npm run build`     | production build                  |
| `npm run start`     | serve the production build        |
| `npm run typecheck` | `tsc --noEmit`                    |

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
