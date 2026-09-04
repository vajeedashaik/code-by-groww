"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { latestSnapshotWithIdBySymbol } from "@/lib/watchlist/snapshots";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const MAX_SYMBOL_LEN = 24;

/**
 * Add a stock to the current user's watchlist.
 *
 * `thesis` is persisted now even though nothing reads it until Phase 7 — the
 * column needs to hold real data by the time the thesis features land.
 *
 * Scale note: we design for ~50 items per user. Adding beyond that is allowed
 * (no cap enforced) — 50 is just the number the UI and later phases assume.
 */
export async function addWatchlistItem(input: {
  symbol: string;
  companyName?: string | null;
  thesis?: string | null;
  targetPrice?: string | null;
}): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, message: "You must be signed in." };

  const symbol = (input.symbol ?? "").trim().toUpperCase();
  if (!symbol) {
    return { ok: false, message: "Pick a stock before adding it." };
  }
  if (symbol.length > MAX_SYMBOL_LEN) {
    return { ok: false, message: "That symbol doesn't look valid." };
  }

  const thesis = (input.thesis ?? "").trim() || null;
  const companyName = (input.companyName ?? "").trim() || null;

  let targetPrice: number | null = null;
  const rawTarget = (input.targetPrice ?? "").trim();
  if (rawTarget) {
    const parsed = Number(rawTarget);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { ok: false, message: "Target price must be a positive number." };
    }
    targetPrice = parsed;
  }

  const supabase = createServerSupabaseClient();
  // user_id is filled by the column default (auth.jwt()->>'sub') and enforced
  // by the RLS insert policy from Phase 1.
  const { error } = await supabase.from("watchlist_items").insert({
    symbol,
    company_name: companyName,
    thesis,
    target_price: targetPrice,
  });

  if (error) {
    // 23505 = unique_violation on unique(user_id, symbol) — already watched.
    if (error.code === "23505") {
      return { ok: false, message: `${symbol} is already in your watchlist.` };
    }
    return { ok: false, message: "Couldn't add that stock. Try again." };
  }

  revalidatePath("/watchlist");
  return { ok: true, message: `Added ${symbol} to your watchlist.` };
}

/**
 * Remove one watchlist item. Filters by `user_id` explicitly *and* relies on
 * the RLS delete policy — defense in depth, per the Phase 2 spec. RLS alone
 * would be enough for security; the explicit filter keeps correctness obvious
 * and independent of policy state.
 *
 * Does not touch user_seen_state — an orphaned row for a removed symbol is
 * harmless: markWatchlistSeen/computeDiffsForUser both derive their symbol
 * list from the user's current watchlist_items, so the orphan is never read
 * or written again.
 */
export async function removeWatchlistItem(id: string): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, message: "You must be signed in." };

  if (!id) return { ok: false, message: "Nothing to remove." };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("watchlist_items")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");

  if (error) {
    return { ok: false, message: "Couldn't remove that stock. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, message: "That item is no longer in your watchlist." };
  }

  revalidatePath("/watchlist");
  return { ok: true, message: "Removed." };
}

/**
 * Marks every symbol in the current user's watchlist as "seen" against
 * whatever snapshot is latest *right now* — re-queried server-side, never
 * trusting a snapshot id from the caller. This is the race-condition policy:
 * if a background job writes a newer snapshot B between the page load (which
 * read snapshot A) and this call firing, this action looks up "latest now"
 * (B) and marks B seen, not A — the server's own query is the source of
 * truth, so a race never leaves seen-state pointing at a stale or corrupted
 * row. See docs/superpowers/plans/2026-09-04-phase4-seen-state-diffing.md
 * Task 3 for the full writeup.
 *
 * A symbol with no snapshot yet is skipped entirely (no row written) so it
 * correctly stays "first view" until real data exists, instead of writing a
 * last_seen_snapshot_id: null row that computeDiffsForUser would then have
 * to special-case.
 *
 * Idempotent: upserts on the (user_id, symbol) primary key from Phase 1, so
 * rapid repeated calls (double-click, retry) update the same row instead of
 * creating duplicates.
 */
export async function markWatchlistSeen(): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, message: "You must be signed in." };

  const supabase = createServerSupabaseClient();

  const { data: items } = await supabase
    .from("watchlist_items")
    .select("symbol")
    .eq("user_id", userId);
  const symbols = [...new Set((items ?? []).map((i) => i.symbol))];
  if (symbols.length === 0) return { ok: true };

  const { data: snapRows } = await supabase
    .from("market_snapshots")
    .select("id, symbol, price, volume, source, fetched_at")
    .in("symbol", symbols)
    .order("fetched_at", { ascending: false })
    .limit(symbols.length * 10);

  const latestBySymbol = latestSnapshotWithIdBySymbol(snapRows ?? []);
  const seenAt = new Date().toISOString();
  const rows = symbols
    .map((symbol) => {
      const snap = latestBySymbol.get(symbol);
      if (!snap) return null;
      return {
        user_id: userId,
        symbol,
        last_seen_snapshot_id: snap.id,
        seen_at: seenAt,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return { ok: true };

  const { error } = await supabase
    .from("user_seen_state")
    .upsert(rows, { onConflict: "user_id,symbol" });

  if (error) {
    return { ok: false, message: "Couldn't update seen-state." };
  }
  return { ok: true };
}
