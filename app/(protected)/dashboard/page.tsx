import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WatchlistDiffsProvider } from "@/components/watchlist/diff-panel";
import DigestView from "@/components/digest/digest-view";

export const dynamic = "force-dynamic";

/**
 * The digest — the first thing a returning user sees (phase6.md's "front
 * door"). Fetches watchlist metadata (symbol/name) server-side; live
 * scores/diffs come from the client-side WatchlistDiffsProvider fetch,
 * same as /watchlist already does.
 */
export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("watchlist_items")
    .select("symbol, company_name");

  if (error) {
    return (
      <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        Couldn&apos;t load your digest. Refresh to try again.
      </p>
    );
  }

  const items = (data ?? []).map((row) => ({
    symbol: row.symbol,
    companyName: row.company_name,
  }));

  if (items.length === 0) {
    return (
      <div className="rounded border border-dashed border-gray-300 p-8 text-center">
        <p className="text-sm font-medium text-gray-700">Nothing on your watchlist yet</p>
        <p className="mt-1 text-sm text-gray-500">
          <Link href="/watchlist" className="underline">
            Add your first stock
          </Link>{" "}
          to start seeing your digest here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WatchlistDiffsProvider>
        <DigestView items={items} />
      </WatchlistDiffsProvider>
      <p className="text-sm">
        <Link href="/watchlist" className="text-gray-600 underline hover:text-gray-900">
          View full watchlist
        </Link>
      </p>
    </div>
  );
}
