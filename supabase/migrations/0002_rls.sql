-- Phase 1 — Row Level Security
-- Run this in the Supabase SQL editor AFTER 0001_init.sql.
--
-- Model:
--   user-scoped tables  -> full CRUD, but only on rows where user_id = Clerk sub
--   shared reference     -> any authenticated user may SELECT; only the service
--                           role (which bypasses RLS) may write

-- ===========================================================================
-- watchlist_items  (user-scoped)
-- ===========================================================================
alter table public.watchlist_items enable row level security;

create policy "watchlist_items_select_own"
  on public.watchlist_items for select to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "watchlist_items_insert_own"
  on public.watchlist_items for insert to authenticated
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "watchlist_items_update_own"
  on public.watchlist_items for update to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "watchlist_items_delete_own"
  on public.watchlist_items for delete to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

-- ===========================================================================
-- user_seen_state  (user-scoped)
-- ===========================================================================
alter table public.user_seen_state enable row level security;

create policy "user_seen_state_select_own"
  on public.user_seen_state for select to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "user_seen_state_insert_own"
  on public.user_seen_state for insert to authenticated
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "user_seen_state_update_own"
  on public.user_seen_state for update to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "user_seen_state_delete_own"
  on public.user_seen_state for delete to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

-- ===========================================================================
-- change_events  (user-scoped)
-- ===========================================================================
alter table public.change_events enable row level security;

create policy "change_events_select_own"
  on public.change_events for select to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "change_events_insert_own"
  on public.change_events for insert to authenticated
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "change_events_update_own"
  on public.change_events for update to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "change_events_delete_own"
  on public.change_events for delete to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

-- ===========================================================================
-- market_snapshots  (shared reference data — read-only to users)
-- ===========================================================================
alter table public.market_snapshots enable row level security;

create policy "market_snapshots_select_authenticated"
  on public.market_snapshots for select to authenticated
  using (true);
-- no insert/update/delete policies -> only the service role can write

-- ===========================================================================
-- daily_history  (shared reference data — read-only to users)
-- ===========================================================================
alter table public.daily_history enable row level security;

create policy "daily_history_select_authenticated"
  on public.daily_history for select to authenticated
  using (true);
-- no insert/update/delete policies -> only the service role can write
