# Project Context — Smart Market Watchlist

Living status doc. Update at the end of each phase.

## Overview

Smart market watchlist web app. 72-hour solo hackathon, 9 phases.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Clerk (auth) · Supabase (Postgres + RLS).

**Phase plan:** 1 Foundation → 2 Watchlist CRUD → 3–9 (market data, scoring, digest, thesis, …).

## Current state — Phase 2: Watchlist CRUD (COMPLETE, pending browser verification)

Users can search real stocks, add them to a per-user watchlist with an optional
thesis + target price, view the list, and remove items with a confirm step.
All persisted in Supabase under the Phase 1 RLS policies. No live prices,
scoring, digest, or thesis usage — those stay for later phases.

### What is built (Phase 2)

| Area | Files |
| --- | --- |
| Search API | `app/api/search/route.ts` — `GET /api/search?q=`, auth-gated (401 if signed out), merges Finnhub `/search` + local NSE list, de-dupes by symbol, degrades to fallback-only + `error` flag on any Finnhub failure/rate-limit/missing key |
| NSE fallback | `lib/stocks/nse-fallback.ts` — 40 liquid NSE symbols (`.NS` suffix) across sectors + `filterNseFallback()`; trade-off documented in file header |
| Search types | `lib/stocks/types.ts` — `StockSearchResult`, `StockSearchResponse` |
| Debounce | `lib/hooks/use-debounce.ts` — generic `useDebounce(value, delay=300)` |
| Watchlist page | `app/(protected)/watchlist/page.tsx` — server component, lists items `added_at desc`, empty state, "Price data coming soon" placeholder, load-error state |
| Server actions | `app/(protected)/watchlist/actions.ts` — `addWatchlistItem` (trims/validates, parses target price, soft-handles `23505` unique violation), `removeWatchlistItem` (explicit `user_id` filter + RLS backstop, `.select("id")` to detect no-op); both `revalidatePath("/watchlist")` |
| Client UI | `components/watchlist/add-stock.tsx` (debounced search box + dropdown + add form, outside-click close, `useTransition`), `components/watchlist/remove-stock-button.tsx` (inline two-step confirm, no native `confirm()`) |
| DB migration | `supabase/migrations/0003_watchlist_company_name.sql` — `alter table watchlist_items add column company_name text` (nullable, denormalised from search metadata) |
| Types | `types/database.ts` — `company_name` added to `watchlist_items` Row/Insert/Update |
| Nav / config | `middleware.ts` protects `/watchlist(.*)`; `components/header.tsx` gets a Watchlist link; `.env.example` gets `FINNHUB_API_KEY`; `supabase/schema.sql` + `README.md` updated |

### Phase 2 verification

- `npx tsc --noEmit` — exit 0
- `npx next build` — 8 routes + middleware compile, 0 errors (`/watchlist` 2.28 kB, `/api/search` added)
- Browser tests **pending** — see README "Phase 2 acceptance tests" (9 items).

### Phase 2 manual steps

- [x] Finnhub API key obtained (free tier). Add it to `.env.local` as
  `FINNHUB_API_KEY=` — the file is open in the IDE and gitignored.
- [ ] Run `supabase/migrations/0003_watchlist_company_name.sql` in the Supabase
  SQL editor.
- [ ] Confirm the 40-symbol NSE fallback list covers intended demo stocks; edit
  `lib/stocks/nse-fallback.ts` if not.
- [ ] Manually tune debounce feel (currently 350 ms) in the browser.
- [ ] Run the 9 README "Phase 2 acceptance tests" in a browser.

### Phase 2 deviations from spec

1. **No "Signalist reference project"** in the repo — the debounce hook is a
   standard `setTimeout`/`clearTimeout` implementation, not adapted from it.
2. **Search is a route handler**, not a server action — debounced client-side
   fetches map more naturally to `GET /api/search`, and it keeps
   `FINNHUB_API_KEY` server-only.
3. **`company_name` denormalised** onto `watchlist_items` (new column) rather
   than looked up at render — the watchlist view needs no external call and
   still renders if Finnhub is down.
4. **No automated tests** — repo has no test runner (no jest/vitest); hackathon
   pace. Acceptance is the 9 manual browser tests.
5. **>50 items allowed, uncapped** — noted in an `actions.ts` comment as the
   design scale, not enforced.

## Phase 1: Foundation (COMPLETE, pending browser verification)

Deployable skeleton: authentication + database schema + RLS. No market data, no
watchlist UI beyond the `/debug` sanity check, no scoring.

### What is built

| Area | Files |
| --- | --- |
| Config | `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env.example` |
| Root shell | `app/layout.tsx` (ClerkProvider + Header + `<main>`), `app/globals.css` (`@import "tailwindcss"`) |
| Public | `app/page.tsx` (landing), `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx` |
| Protected | `app/(protected)/layout.tsx` (`await auth.protect()`), `app/(protected)/dashboard/page.tsx` (`Welcome, {firstName}`), `app/(protected)/debug/page.tsx` (auth+RLS+DB round-trip) |
| Auth gate | `middleware.ts` — `clerkMiddleware` + `createRouteMatcher(['/dashboard(.*)','/debug(.*)'])` → `auth.protect()` |
| Header | `components/header.tsx` — app name, `<UserButton/>` (signed in) / `<SignInButton mode="modal">` (signed out) |
| Supabase clients | `lib/supabase/server.ts` (RSC/actions, Clerk token via `accessToken`), `lib/supabase/client.ts` (`useBrowserSupabaseClient` hook, unused in P1), `lib/supabase/admin.ts` (service role, bypasses RLS, server-only) |
| Types | `types/database.ts` — hand-written `Database` type for all 5 tables |
| SQL | `supabase/migrations/0001_init.sql` (tables), `supabase/migrations/0002_rls.sql` (RLS + policies), `supabase/schema.sql` (combined reference) |
| Docs | `README.md`, `docs/superpowers/specs/2026-09-04-phase1-foundation-design.md`, this file |

### Database schema (in `supabase/migrations/`)

Five tables in `public`:

- `watchlist_items` — `id uuid pk`, `user_id text not null default (auth.jwt()->>'sub')`, `symbol text`, `thesis text`, `target_price numeric`, `added_at timestamptz`, `unique(user_id, symbol)`. **RLS on.**
- `market_snapshots` — `id uuid pk`, `symbol`, `price numeric`, `volume bigint`, `source text`, `fetched_at timestamptz`, `status text default 'FRESH'`. **RLS on, select-only for users.**
- `user_seen_state` — `user_id text default (auth.jwt()->>'sub')`, `symbol text`, `last_seen_snapshot_id uuid → market_snapshots(id)`, `seen_at timestamptz`, `primary key (user_id, symbol)`. **RLS on.**
- `daily_history` — `symbol text`, `date date`, `close numeric`, `volume bigint`, `primary key (symbol, date)`. **RLS on, select-only for users.**
- `change_events` — `id uuid pk`, `user_id text default (auth.jwt()->>'sub')`, `symbol text`, `detected_at timestamptz`, `meaningfulness_score numeric`, `magnitude numeric`, `confidence text`, `explanation jsonb`, `thesis_verdict text`. **RLS on.**

### RLS model

- **User-scoped** (`watchlist_items`, `user_seen_state`, `change_events`): 4 policies each (select/insert/update/delete), role `authenticated`, predicate `(select auth.jwt()->>'sub') = user_id`.
- **Shared reference** (`market_snapshots`, `daily_history`): single `for select to authenticated using (true)`. No write policies → only the service-role key writes.

### Auth integration

Clerk **native** third-party auth for Supabase (JWT template deprecated Apr 2025).
Supabase clients attach the Clerk session token through the `accessToken` option;
Postgres RLS reads the Clerk user id from `auth.jwt() ->> 'sub'`. `user_id`
columns default to that claim, so inserts need no explicit `user_id`.

### Environment variables

Listed in `.env.example`. Real values live in `.env.local` (gitignored). Required:
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
`NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`,
`NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`,
`NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`.

### Routes

| Path | Access | Purpose |
| --- | --- | --- |
| `/` | public | Landing |
| `/sign-in`, `/sign-up` | public | Clerk components |
| `/dashboard` | authenticated | `Welcome, {name}` — auth proof |
| `/debug` | authenticated | Temporary — auth + RLS + DB round-trip. Remove in a later phase. |

## Verification status

Done by Claude (no browser / no Clerk session available):

- `npm install` — ok (123 packages)
- `npx tsc --noEmit` — exit 0
- `npx next build` — all 6 routes + middleware compile, 0 errors
- `npx next dev` — boots clean on real keys, reads `.env.local`
- `GET /` → 200, `GET /sign-in` → 200
- `GET /dashboard`, `/debug` via curl → 404 with `x-clerk-auth-reason: protect-rewrite, dev-browser-missing`. This is Clerk's dev-mode handshake failing for a cookieless client (curl), **not** a routing bug — middleware runs and protects the route; a real browser is redirected to `/sign-in`.

Pending — user must run in a browser with real Clerk users (README "Phase 1 acceptance tests"):

1. Sign up → redirected to `/dashboard`, name shows.
2. Sign out → sign in → session persists, lands on `/dashboard`.
3. `/dashboard` while signed out → redirected to sign-in.
4. `/debug` as User A → insert TEST row, reads back, deletes (all steps green).
5. User B cannot see or query User A's `watchlist_items` rows (RLS proof).
6. Supabase dashboard shows all 5 tables with correct columns/constraints — verify `unique(user_id, symbol)` on `watchlist_items` and composite PK on `user_seen_state`.
7. Fresh clone + `.env.local` filled → `npm run dev` boots with no missing-config errors.

Also still required (one-time, in dashboards): run `0001_init.sql` then
`0002_rls.sql` in the Supabase SQL editor; add Clerk as a Third-Party Auth
provider in Supabase and paste the Clerk domain. See README steps 3–4.

## Deviations from the Phase 1 spec

1. **Browser Supabase client is a hook** (`useBrowserSupabaseClient()`), not a plain `createBrowserSupabaseClient()` factory — the Clerk session is only reachable through React context. Unused in Phase 1; ready for later phases.
2. **Env var name** `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Clerk docs sometimes call it `PUBLISHABLE_KEY`; same value).
3. **`.env.local` was created** with placeholder keys so `next build` could compile before real keys existed; user has since filled in real keys. Gitignored.
4. **Tailwind v4** (config-less, `@import "tailwindcss"` + `@tailwindcss/postcss`) — spec said only "Tailwind CSS".
5. **Sign-in/up**: both dedicated Clerk pages *and* a modal `<SignInButton>` in the header. Header uses the real `<UserButton/>` for the "user menu placeholder".

## Git

- `3d41835` docs: Phase 1 foundation design spec
- `4f8ea2b` feat: Phase 1 foundation scaffold

`node_modules/`, `.next/`, `.env*.local` are gitignored. `phase2.md` was
committed with the scaffold by accident — harmless.

## How to continue

- Local run: fill `.env.local` (now incl. `FINNHUB_API_KEY`), run migrations
  `0001`→`0003`, `npm install`, `npm run dev`, open `http://localhost:3000`.
- Phase 2 built and compiling. Run the README "Phase 2 acceptance tests" in a
  browser before starting Phase 3 (Market Data Pipeline — see `phase3.md`).
