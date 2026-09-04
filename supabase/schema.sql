-- ===========================================================================
-- Smart Market Watchlist — full schema (Phase 1)
-- Reference dump. This is 0001_init.sql + 0002_rls.sql concatenated.
-- Apply the numbered files in supabase/migrations/ in order instead of this
-- file when setting up a fresh project.
-- ===========================================================================

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------
create table if not exists public.watchlist_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null default (auth.jwt() ->> 'sub'),
  symbol       text not null,
  thesis       text,
  target_price numeric,
  added_at     timestamptz not null default now(),
  unique (user_id, symbol)
);

create table if not exists public.market_snapshots (
  id         uuid primary key default gen_random_uuid(),
  symbol     text not null,
  price      numeric not null,
  volume     bigint,
  source     text not null,
  fetched_at timestamptz not null default now(),
  status     text not null default 'FRESH'
);

create table if not exists public.user_seen_state (
  user_id               text not null default (auth.jwt() ->> 'sub'),
  symbol                text not null,
  last_seen_snapshot_id uuid references public.market_snapshots (id),
  seen_at               timestamptz not null default now(),
  primary key (user_id, symbol)
);

create table if not exists public.daily_history (
  symbol text not null,
  date   date not null,
  close  numeric not null,
  volume bigint,
  primary key (symbol, date)
);

create table if not exists public.change_events (
  id                   uuid primary key default gen_random_uuid(),
  user_id              text not null default (auth.jwt() ->> 'sub'),
  symbol               text not null,
  detected_at          timestamptz not null default now(),
  meaningfulness_score numeric,
  magnitude            numeric,
  confidence           text,
  explanation          jsonb,
  thesis_verdict       text
);

-- --------------------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------------------
alter table public.watchlist_items enable row level security;
alter table public.user_seen_state enable row level security;
alter table public.change_events   enable row level security;
alter table public.market_snapshots enable row level security;
alter table public.daily_history    enable row level security;

-- user-scoped: watchlist_items
create policy "watchlist_items_select_own" on public.watchlist_items for select to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);
create policy "watchlist_items_insert_own" on public.watchlist_items for insert to authenticated
  with check ((select auth.jwt() ->> 'sub') = user_id);
create policy "watchlist_items_update_own" on public.watchlist_items for update to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);
create policy "watchlist_items_delete_own" on public.watchlist_items for delete to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

-- user-scoped: user_seen_state
create policy "user_seen_state_select_own" on public.user_seen_state for select to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);
create policy "user_seen_state_insert_own" on public.user_seen_state for insert to authenticated
  with check ((select auth.jwt() ->> 'sub') = user_id);
create policy "user_seen_state_update_own" on public.user_seen_state for update to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);
create policy "user_seen_state_delete_own" on public.user_seen_state for delete to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

-- user-scoped: change_events
create policy "change_events_select_own" on public.change_events for select to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);
create policy "change_events_insert_own" on public.change_events for insert to authenticated
  with check ((select auth.jwt() ->> 'sub') = user_id);
create policy "change_events_update_own" on public.change_events for update to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);
create policy "change_events_delete_own" on public.change_events for delete to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

-- shared reference: read-only to authenticated users, service role writes
create policy "market_snapshots_select_authenticated" on public.market_snapshots for select to authenticated
  using (true);
create policy "daily_history_select_authenticated" on public.daily_history for select to authenticated
  using (true);
