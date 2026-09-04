import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ALL_REFERENCE_SYMBOLS } from "@/lib/market-data/sectors";

/**
 * Helpers shared by both Inngest jobs. Symbol loading uses the SERVICE-ROLE
 * client on purpose: the watchlisted symbol set is shared reference data the
 * jobs need across all users, not something scoped to one Clerk session, and
 * the jobs run with no user context at all.
 */

/**
 * Distinct, trimmed, upper-cased symbols across every user's watchlist,
 * unioned with the fixed Phase 5 reference-symbol set (Nifty + every
 * sector-mapping stock) so both jobs fetch/store them even though no user
 * has them in watchlist_items — "just another symbol" per phase5.md task 2.
 */
export async function loadWatchlistSymbols(): Promise<string[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("watchlist_items")
    .select("symbol");

  if (error) {
    throw new Error(`loadWatchlistSymbols: ${error.message}`);
  }

  const set = new Set<string>();
  for (const row of data ?? []) {
    const s = (row.symbol ?? "").trim().toUpperCase();
    if (s) set.add(s);
  }
  for (const s of ALL_REFERENCE_SYMBOLS) {
    set.add(s);
  }
  return [...set];
}

/** Split `items` into arrays of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
