-- Phase 2 — add company name to watchlist_items
-- Run this in the Supabase SQL editor AFTER 0002_rls.sql.
--
-- Phase 2 shows the company name on /watchlist. The name comes from search
-- metadata (Finnhub / static NSE list) at add time and is denormalised onto
-- the row so the watchlist view needs no extra lookup and still renders if the
-- external API is down. Nullable: older rows and any add path without metadata
-- simply show the symbol.

alter table public.watchlist_items
  add column if not exists company_name text;
