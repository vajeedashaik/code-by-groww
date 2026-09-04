import { createServerSupabaseClient } from "@/lib/supabase/server";
import AddStock from "@/components/watchlist/add-stock";
import RemoveStockButton from "@/components/watchlist/remove-stock-button";
import PriceCell from "@/components/watchlist/price-cell";
import { WatchlistDiffsProvider, DiffLine } from "@/components/watchlist/diff-panel";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Newest snapshot per symbol; on an equal timestamp, prefer the yahoo row. */
function latestSnapshotBySymbol(
  rows: { symbol: string; price: number; source: string; fetched_at: string }[],
) {
  const map = new Map<string, { price: number; source: string; fetched_at: string }>();
  for (const r of rows) {
    const cur = map.get(r.symbol);
    if (
      !cur ||
      r.fetched_at > cur.fetched_at ||
      (r.fetched_at === cur.fetched_at && r.source === "yahoo")
    ) {
      map.set(r.symbol, { price: r.price, source: r.source, fetched_at: r.fetched_at });
    }
  }
  return map;
}

/** Newest daily_history close per symbol -> "previous close" reference. */
function latestCloseBySymbol(rows: { symbol: string; date: string; close: number }[]) {
  const map = new Map<string, { close: number; date: string }>();
  for (const r of rows) {
    const cur = map.get(r.symbol);
    if (!cur || r.date > cur.date) {
      map.set(r.symbol, { close: r.close, date: r.date });
    }
  }
  return new Map([...map].map(([symbol, v]) => [symbol, v.close]));
}

export default async function WatchlistPage() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("watchlist_items")
    .select("id, symbol, company_name, thesis, added_at")
    .order("added_at", { ascending: false });

  const items = data ?? [];
  const symbols = [...new Set(items.map((i) => i.symbol))];

  // market_snapshots + daily_history are shared reference tables with a
  // `select ... using (true)` RLS policy (Phase 1) — a signed-in user can read
  // them through the RLS-scoped client.
  let priceBySymbol = new Map<
    string,
    { price: number; source: string; fetched_at: string }
  >();
  let prevCloseBySymbol = new Map<string, number>();

  if (symbols.length > 0) {
    const [
      { data: snaps, error: snapsError },
      { data: hist, error: histError },
    ] = await Promise.all([
      supabase
        .from("market_snapshots")
        .select("symbol, price, source, fetched_at")
        .in("symbol", symbols)
        .order("fetched_at", { ascending: false })
        .limit(symbols.length * 10),
      supabase
        .from("daily_history")
        .select("symbol, date, close")
        .in("symbol", symbols)
        .order("date", { ascending: false })
        .limit(symbols.length * 10),
    ]);

    if (snapsError) {
      console.error(`[watchlist] market_snapshots query failed: ${snapsError.message}`);
    }
    if (histError) {
      console.error(`[watchlist] daily_history query failed: ${histError.message}`);
    }

    priceBySymbol = latestSnapshotBySymbol(snaps ?? []);
    prevCloseBySymbol = latestCloseBySymbol(hist ?? []);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Your watchlist</h1>
        <p className="text-sm text-gray-600">
          Search a stock, add it with an optional thesis, and it stays here —
          synced to your account.
        </p>
      </div>

      <AddStock />

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn&apos;t load your watchlist. Refresh to try again.
        </p>
      )}

      {!error && items.length === 0 && (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm font-medium text-gray-700">
            Nothing on your watchlist yet
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Use the search box above to add your first stock.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <WatchlistDiffsProvider>
          <ul className="divide-y divide-gray-200 rounded border border-gray-200">
            {items.map((item) => {
              const snap = priceBySymbol.get(item.symbol);
              return (
                <li key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium">{item.symbol}</span>
                        {item.company_name && (
                          <span className="truncate text-sm text-gray-500">
                            {item.company_name}
                          </span>
                        )}
                      </div>
                      {item.thesis && (
                        <p className="mt-1 text-sm text-gray-700">{item.thesis}</p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">
                        Added {formatDate(item.added_at)}
                      </p>
                      <p className="mt-1">
                        <DiffLine symbol={item.symbol} />
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <PriceCell
                        price={snap?.price}
                        prevClose={prevCloseBySymbol.get(item.symbol)}
                      />
                      <RemoveStockButton id={item.id} symbol={item.symbol} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </WatchlistDiffsProvider>
      )}
    </div>
  );
}
