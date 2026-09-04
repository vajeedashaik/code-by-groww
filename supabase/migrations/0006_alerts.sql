-- Phase 10 — price/volume threshold alerts, evaluated by a new Inngest job
-- (lib/inngest/functions/alert-check.ts) against market_snapshots and
-- delivered by email. Run this in the Supabase SQL editor AFTER
-- 0005_market_snapshot_conflict.sql.

create table if not exists public.alerts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            text not null default (auth.jwt() ->> 'sub'),
  symbol             text not null,
  company_name       text,
  alert_type         text not null check (alert_type in ('price_above', 'price_below', 'volume_above')),
  threshold          numeric not null,
  active             boolean not null default true,
  last_triggered_at  timestamptz,
  cooldown_minutes   integer not null default 60,
  created_at         timestamptz not null default now()
);

create index if not exists alerts_active_symbol_idx on public.alerts (symbol) where active;

alter table public.alerts enable row level security;

create policy "alerts_select_own" on public.alerts for select to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);
create policy "alerts_insert_own" on public.alerts for insert to authenticated
  with check ((select auth.jwt() ->> 'sub') = user_id);
create policy "alerts_update_own" on public.alerts for update to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);
create policy "alerts_delete_own" on public.alerts for delete to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);
