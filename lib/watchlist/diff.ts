import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { latestSnapshotWithIdBySymbol } from "@/lib/watchlist/snapshots";

/**
 * Raw diff between what a user last saw for a symbol and what's current now.
 * No scoring/meaningfulness judgement — that's Phase 5. `timeElapsedMs` is
 * measured from `seenAt` (when the user last looked), not from the old
 * snapshot's own fetched_at, so the UI can say "4 hours ago" meaning "since
 * you last checked", which is the number a user actually cares about.
 */
export interface SymbolDiff {
  symbol: string;
  isFirstView: boolean;
  /** The market_snapshots row id treated as "now" for this diff — the change_events dedup key. Null when no current snapshot exists yet. */
  currentSnapshotId: string | null;
  priceThen: number | null;
  priceNow: number | null;
  priceDelta: number | null;
  priceDeltaPct: number | null;
  volumeThen: number | null;
  volumeNow: number | null;
  timeElapsedMs: number | null;
  seenAt: string | null;
}

/**
 * Batched, N+1-safe: exactly 3 queries no matter how many symbols. Symbols
 * with no user_seen_state row (or a row whose last_seen_snapshot_id is null
 * — see markWatchlistSeen, which deliberately never writes a null id) come
 * back as isFirstView: true rather than a fake zero-delta.
 */
export async function computeDiffsForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  symbols: string[],
): Promise<SymbolDiff[]> {
  if (symbols.length === 0) return [];

  const [
    { data: seenRows, error: seenError },
    { data: snapRows, error: snapError },
  ] = await Promise.all([
    supabase
      .from("user_seen_state")
      .select("symbol, last_seen_snapshot_id, seen_at")
      .eq("user_id", userId)
      .in("symbol", symbols),
    supabase
      .from("market_snapshots")
      .select("id, symbol, price, volume, source, fetched_at")
      .in("symbol", symbols)
      .order("fetched_at", { ascending: false })
      .limit(symbols.length * 10),
  ]);
  if (seenError) {
    console.error(`[computeDiffsForUser] user_seen_state query failed: ${seenError.message}`);
  }
  if (snapError) {
    console.error(`[computeDiffsForUser] market_snapshots query failed: ${snapError.message}`);
  }

  const currentBySymbol = latestSnapshotWithIdBySymbol(snapRows ?? []);
  const seenBySymbol = new Map((seenRows ?? []).map((r) => [r.symbol, r]));

  const thenIds = [
    ...new Set(
      (seenRows ?? [])
        .map((r) => r.last_seen_snapshot_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  const thenById = new Map<
    string,
    { price: number; volume: number | null; fetched_at: string }
  >();
  if (thenIds.length > 0) {
    const { data: thenRows, error: thenError } = await supabase
      .from("market_snapshots")
      .select("id, price, volume, fetched_at")
      .in("id", thenIds);
    if (thenError) {
      console.error(`[computeDiffsForUser] "then" snapshots query failed: ${thenError.message}`);
    }
    for (const row of thenRows ?? []) {
      thenById.set(row.id, row);
    }
  }

  return symbols.map((symbol) => {
    const current = currentBySymbol.get(symbol) ?? null;
    const seen = seenBySymbol.get(symbol) ?? null;
    const then = seen?.last_seen_snapshot_id
      ? (thenById.get(seen.last_seen_snapshot_id) ?? null)
      : null;

    if (!seen || !then) {
      return {
        symbol,
        isFirstView: true,
        currentSnapshotId: current?.id ?? null,
        priceThen: null,
        priceNow: current?.price ?? null,
        priceDelta: null,
        priceDeltaPct: null,
        volumeThen: null,
        volumeNow: current?.volume ?? null,
        timeElapsedMs: null,
        seenAt: null,
      };
    }

    const priceNow = current?.price ?? null;
    const priceDelta = priceNow !== null ? priceNow - then.price : null;
    const priceDeltaPct =
      priceDelta !== null && then.price !== 0
        ? (priceDelta / then.price) * 100
        : null;

    return {
      symbol,
      isFirstView: false,
      currentSnapshotId: current?.id ?? null,
      priceThen: then.price,
      priceNow,
      priceDelta,
      priceDeltaPct,
      volumeThen: then.volume,
      volumeNow: current?.volume ?? null,
      timeElapsedMs: Date.now() - new Date(seen.seen_at).getTime(),
      seenAt: seen.seen_at,
    };
  });
}
