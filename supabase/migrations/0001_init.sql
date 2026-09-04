-- Phase 1 — schema init
-- Run this in the Supabase SQL editor BEFORE 0002_rls.sql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- watchlist_items  (user-scoped)
-- ---------------------------------------------------------------------------
create table if not exists public.watchlist_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null default (auth.jwt() ->> 'sub'),
  symbol       text not null,
  thesis       text,
  target_price numeric,
  added_at     timestamptz not null default now(),
  unique (user_id, symbol)
);

-- ---------------------------------------------------------------------------
-- market_snapshots  (shared reference data)
-- ---------------------------------------------------------------------------
create table if not exists public.market_snapshots (
  id         uuid primary key default gen_random_uuid(),
  symbol     text not null,
  price      numeric not null,
  volume     bigint,
  source     text not null,
  fetched_at timestamptz not null default now(),
  status     text not null default 'FRESH'
);

-- ---------------------------------------------------------------------------
-- user_seen_state  (user-scoped, composite PK)
-- ---------------------------------------------------------------------------
create table if not exists public.user_seen_state (
  user_id               text not null default (auth.jwt() ->> 'sub'),
  symbol                text not null,
  last_seen_snapshot_id uuid references public.market_snapshots (id),
  seen_at               timestamptz not null default now(),
  primary key (user_id, symbol)
);

-- ---------------------------------------------------------------------------
-- daily_history  (shared reference data, composite PK)
-- ---------------------------------------------------------------------------
create table if not exists public.daily_history (
  symbol text not null,
  date   date not null,
  close  numeric not null,
  volume bigint,
  primary key (symbol, date)
);

-- ---------------------------------------------------------------------------
-- change_events  (user-scoped)
-- ---------------------------------------------------------------------------
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
