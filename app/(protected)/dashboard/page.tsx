import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WatchlistDiffsProvider } from "@/components/watchlist/diff-panel";
import DigestView from "@/components/digest/digest-view";
import GlassCard from "@/components/ui/glass-card";

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
      <GlassCard className="border-down/20 px-4 py-3 text-sm text-down">
        Couldn&apos;t load your digest. Refresh to try again.
      </GlassCard>
    );
  }

  const items = (data ?? []).map((row) => ({
    symbol: row.symbol,
    companyName: row.company_name,
  }));

  if (items.length === 0) {
    return (
      <GlassCard className="border-dashed p-10 text-center">
        <p className="text-sm font-medium text-white/80">Nothing on your watchlist yet</p>
        <p className="mt-1.5 text-sm text-white/45">
          <Link href="/watchlist" className="text-pulse underline decoration-pulse/40 underline-offset-4 hover:text-pulse-soft">
            Add your first stock
          </Link>{" "}
          to start seeing your digest here.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <WatchlistDiffsProvider>
        <DigestView items={items} />
      </WatchlistDiffsProvider>
      <p className="text-sm">
        <Link href="/watchlist" className="text-white/45 underline decoration-white/20 underline-offset-4 hover:text-white/80">
          View full watchlist
        </Link>
      </p>
    </div>
  );
}
