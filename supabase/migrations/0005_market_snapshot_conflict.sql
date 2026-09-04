-- Phase 8: dual-source reconciliation. When a symbol has quotes from more
-- than one source (currently only US symbols, where both yahoo and finnhub
-- answer), the snapshot job picks one row as "chosen" per the documented
-- policy in lib/market-data/reconcile.ts and — only when the two prices
-- genuinely disagree beyond the conflict threshold — records that a conflict
-- occurred plus the alternate source's value on the chosen row. The
-- non-chosen source's row is still inserted as its own plain historical
-- record; these columns default to false/null on every row that never had a
-- second source to compare against.
alter table public.market_snapshots
  add column if not exists conflict boolean not null default false,
  add column if not exists alt_source text,
  add column if not exists alt_price numeric,
  add column if not exists alt_fetched_at timestamptz;
