-- Phase 5 — dedupe change_events by snapshot, not by insert-every-reload.
-- Run this in the Supabase SQL editor AFTER 0003_watchlist_company_name.sql.

alter table public.change_events
  add column if not exists snapshot_id uuid references public.market_snapshots (id);

-- Postgres has no "add constraint if not exists" for unique constraints, so
-- guard the re-run case explicitly (mirrors the column add above).
do $$
begin
  alter table public.change_events
    add constraint change_events_user_symbol_snapshot_key
    unique (user_id, symbol, snapshot_id);
exception
  when duplicate_object then null;
end $$;
