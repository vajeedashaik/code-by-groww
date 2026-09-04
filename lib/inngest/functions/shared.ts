import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Helpers shared by both Inngest jobs. Symbol loading uses the SERVICE-ROLE
 * client on purpose: the watchlisted symbol set is shared reference data the
 * jobs need across all users, not something scoped to one Clerk session, and
 * the jobs run with no user context at all.
 */

/** Distinct, trimmed, upper-cased symbols across every user's watchlist. */
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
