import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import AddStock from "@/components/watchlist/add-stock";
import RemoveStockButton from "@/components/watchlist/remove-stock-button";
import EditThesis from "@/components/watchlist/edit-thesis";
import PriceCell from "@/components/watchlist/price-cell";
import TimeMachine from "@/components/watchlist/time-machine";
import StockChartToggle from "@/components/watchlist/stock-chart-toggle";
import ManageAlerts from "@/components/watchlist/manage-alerts";
import { WatchlistDiffsProvider, DiffLine } from "@/components/watchlist/diff-panel";
import GlassCard from "@/components/ui/glass-card";
import type { AlertRow, AlertType } from "@/lib/alerts/types";

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

function groupAlertsBySymbol(
  rows: {
    id: string;
    symbol: string;
    company_name: string | null;
    alert_type: string;
    threshold: number;
    active: boolean;
    last_triggered_at: string | null;
    cooldown_minutes: number;
  }[],
): Map<string, AlertRow[]> {
  const map = new Map<string, AlertRow[]>();
  for (const r of rows) {
    const list = map.get(r.symbol) ?? [];
    list.push({
      id: r.id,
      symbol: r.symbol,
      companyName: r.company_name,
      alertType: r.alert_type as AlertType,
      threshold: r.threshold,
      active: r.active,
      lastTriggeredAt: r.last_triggered_at,
      cooldownMinutes: r.cooldown_minutes,
    });
    map.set(r.symbol, list);
  }
  return map;
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

  const { data: alertRows, error: alertsError } = await supabase
    .from("alerts")
    .select("id, symbol, company_name, alert_type, threshold, active, last_triggered_at, cooldown_minutes")
    .order("created_at", { ascending: false });
  if (alertsError) {
    console.error(`[watchlist] alerts query failed: ${alertsError.message}`);
  }
  const alertsBySymbol = groupAlertsBySymbol(alertRows ?? []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-white">Your watchlist</h1>
        <p className="text-sm text-white/50">
          Search a stock, add it with an optional thesis, and it stays here —
          synced to your account.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/dashboard" className="text-white/45 underline decoration-white/20 underline-offset-4 hover:text-white/80">
            Back to digest
          </Link>
        </p>
      </div>

      <AddStock />

      {error && (
        <GlassCard className="border-down/20 px-4 py-3 text-sm text-down">
          Couldn&apos;t load your watchlist. Refresh to try again.
        </GlassCard>
      )}

      {!error && items.length === 0 && (
        <GlassCard className="border-dashed p-10 text-center">
          <p className="text-sm font-medium text-white/80">
            Nothing on your watchlist yet
          </p>
          <p className="mt-1.5 text-sm text-white/45">
            Use the search box above to add your first stock.
          </p>
        </GlassCard>
      )}

      {items.length > 0 && (
        <WatchlistDiffsProvider>
          <GlassCard className="divide-y divide-white/5 p-0">
            {items.map((item) => {
              const snap = priceBySymbol.get(item.symbol);
              return (
                <div key={item.id} className="p-4 transition-colors hover:bg-white/[0.02] sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <Link
                          href={`/stocks/${encodeURIComponent(item.symbol)}`}
                          className="font-display font-semibold text-white hover:text-pulse"
                        >
                          {item.symbol}
                        </Link>
                        {item.company_name && (
                          <span className="truncate text-sm text-white/45">
                            {item.company_name}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5">
                        {item.thesis && (
                          <p className="text-sm text-white/70">{item.thesis}</p>
                        )}
                        <EditThesis id={item.id} thesis={item.thesis} />
                      </div>
                      <p className="mt-1.5 text-xs text-white/30">
                        Added {formatDate(item.added_at)}
                      </p>
                      <p className="mt-1.5">
                        <DiffLine symbol={item.symbol} />
                      </p>
                      <TimeMachine symbol={item.symbol} />
                      <StockChartToggle symbol={item.symbol} />
                      <ManageAlerts
                        symbol={item.symbol}
                        companyName={item.company_name}
                        alerts={alertsBySymbol.get(item.symbol) ?? []}
                      />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <PriceCell
                        price={snap?.price}
                        prevClose={prevCloseBySymbol.get(item.symbol)}
                        fetchedAt={snap?.fetched_at}
                      />
                      <RemoveStockButton id={item.id} symbol={item.symbol} />
                    </div>
                  </div>
                </div>
              );
            })}
          </GlassCard>
        </WatchlistDiffsProvider>
      )}
    </div>
  );
}
