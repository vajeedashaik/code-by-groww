import { createServerSupabaseClient } from "@/lib/supabase/server";
import AddStock from "@/components/watchlist/add-stock";
import RemoveStockButton from "@/components/watchlist/remove-stock-button";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function WatchlistPage() {
  const supabase = createServerSupabaseClient();
  // RLS scopes this to the current Clerk user; no explicit user_id filter needed
  // for reads, but the delete action adds one as defense in depth.
  const { data, error } = await supabase
    .from("watchlist_items")
    .select("id, symbol, company_name, thesis, added_at")
    .order("added_at", { ascending: false });

  const items = data ?? [];

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
        <ul className="divide-y divide-gray-200 rounded border border-gray-200">
          {items.map((item) => (
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
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                    Price data coming soon
                  </span>
                  <RemoveStockButton id={item.id} symbol={item.symbol} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
