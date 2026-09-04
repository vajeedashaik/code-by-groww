import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Loads recent daily_history rows for `symbols`, grouped by symbol and
 * sorted oldest-to-newest, capped at `perSymbolLimit` each. One bounded
 * query regardless of symbol count — same accepted pattern as the
 * `.limit(symbols.length * N)` queries already used in Phase 3/4 (grouping
 * happens in JS, not via a per-symbol DB round trip).
 */
export interface HistoryBar {
  date: string;
  close: number;
  volume: number | null;
}

export async function loadRecentHistory(
  supabase: SupabaseClient<Database>,
  symbols: string[],
  perSymbolLimit = 25,
): Promise<Map<string, HistoryBar[]>> {
  const result = new Map<string, HistoryBar[]>();
  if (symbols.length === 0) return result;

  // Global ORDER BY date DESC + a shared LIMIT means the cutoff can fall
  // mid-date-group across symbols with uneven coverage, in principle
  // starving one symbol's rows in favor of another's (no per-symbol
  // partition is available without an RPC/view). A generous 3x safety
  // margin plus a deterministic secondary sort key make this negligible in
  // practice for this project's data volume (bounded by the Phase 3
  // backfill's fixed ~60-day window per symbol) without the added
  // complexity of a partitioned query — an accepted trade-off, not a full
  // fix. If this ever needs to be exact, replace with a
  // `row_number() over (partition by symbol order by date desc)` RPC.
  const { data, error } = await supabase
    .from("daily_history")
    .select("symbol, date, close, volume")
    .in("symbol", symbols)
    .order("date", { ascending: false })
    .order("symbol", { ascending: true })
    .limit(symbols.length * perSymbolLimit * 3);

  if (error) {
    console.error(`[loadRecentHistory] daily_history query failed: ${error.message}`);
    return result;
  }

  const bySymbolDesc = new Map<string, HistoryBar[]>();
  for (const row of data ?? []) {
    const bars = bySymbolDesc.get(row.symbol) ?? [];
    if (bars.length < perSymbolLimit) {
      bars.push({ date: row.date, close: row.close, volume: row.volume });
      bySymbolDesc.set(row.symbol, bars);
    }
  }

  for (const [symbol, barsDesc] of bySymbolDesc) {
    result.set(symbol, [...barsDesc].reverse()); // oldest-to-newest
  }
  return result;
}
