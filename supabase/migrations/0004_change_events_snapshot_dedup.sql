-- Phase 5 — dedupe change_events by snapshot, not by insert-every-reload.
-- Run this in the Supabase SQL editor AFTER 0003_watchlist_company_name.sql.

alter table public.change_events
  add column snapshot_id uuid references public.market_snapshots (id);

alter table public.change_events
  add constraint change_events_user_symbol_snapshot_key
  unique (user_id, symbol, snapshot_id);
