import "server-only";
import { inngest } from "@/lib/inngest/client";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getAllQuotes, MarketDataError } from "@/lib/market-data";
import { classifyStaleness } from "@/lib/market-data/staleness";
import { reconcileQuotes } from "@/lib/market-data/reconcile";
import { chunk, loadWatchlistSymbols } from "@/lib/inngest/functions/shared";

/**
 * Snapshot ingest. Runs every 5 minutes (and on the market/snapshot.requested
 * event, which the dev trigger route and the Inngest dashboard fire).
 *
 * For each distinct watchlisted symbol it writes one market_snapshots row per
 * source that answered (US symbols -> yahoo + finnhub, NSE -> yahoo only). A
 * single symbol failing outright (bad ticker, timeout, rate limit with every
 * source down) is logged into the `failures` array and skipped — it never
 * aborts the batch. When a symbol still got >=1 quote but a *secondary* source
 * failed, that per-source failure goes into `secondaryFailures` instead: the
 * row(s) we did get are kept. Symbols are processed in chunks of 5 with a 1s
 * gap so we don't hammer either source.
 *
 * Polling interval: 5 minutes (see docs/superpowers/specs). Staleness bands in
 * lib/market-data/staleness.ts assume this cadence.
 *
 * Phase 8: when a symbol gets more than one quote in the same run (currently
 * only US symbols, where both yahoo and finnhub answer), lib/market-data/
 * reconcile.ts's documented policy picks a "chosen" quote. Every quote is
 * still inserted as its own row (nothing is dropped), but the chosen row also
 * carries `conflict`/`alt_source`/`alt_price`/`alt_fetched_at` when the two
 * sources genuinely disagreed — queryable and demoable, not just logged.
 *
 * inngest@4 note: createFunction takes (options, handler); the trigger list
 * lives in options.triggers (the older third-positional-arg form is gone).
 */

const CHUNK_SIZE = 5;

interface InsertRow {
  symbol: string;
  price: number;
  volume: number | null;
  source: string;
  status: "FRESH";
  fetched_at: string;
  conflict: boolean;
  alt_source: string | null;
  alt_price: number | null;
  alt_fetched_at: string | null;
}

interface Failure {
  symbol: string;
  source: string;
  code: string;
}

export const snapshotIngest = inngest.createFunction(
  {
    id: "snapshot-ingest",
    name: "Market snapshot ingest",
    triggers: [
      { cron: "*/5 * * * *" },
      { event: "market/snapshot.requested" },
    ],
  },
  async ({ step }) => {
    const symbols = await step.run("load-symbols", loadWatchlistSymbols);

    if (symbols.length === 0) {
      return {
        processed: 0,
        inserted: 0,
        decayed: 0,
        failures: [] as Failure[],
        secondaryFailures: [] as Failure[],
      };
    }

    const chunks = chunk(symbols, CHUNK_SIZE);
    const allRows: InsertRow[] = [];
    const allFailures: Failure[] = [];
    const allSecondaryFailures: Failure[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const { rows, failures, secondaryFailures } = await step.run(
        `fetch-chunk-${i}`,
        async () => {
          const rowsOut: InsertRow[] = [];
          const failOut: Failure[] = [];
          const secondaryOut: Failure[] = [];
          const nowIso = new Date().toISOString();

          await Promise.all(
            chunks[i].map(async (symbol) => {
              try {
                const { quotes, errors } = await getAllQuotes(symbol);

                const reconciled = quotes.length > 1 ? reconcileQuotes(quotes) : null;
                if (reconciled?.conflict) {
                  console.warn(`[snapshot-ingest] conflict for ${symbol}: ${reconciled.reason}`);
                }

                for (const q of quotes) {
                  const isChosen = reconciled !== null && q === reconciled.chosen;
                  rowsOut.push({
                    symbol: q.symbol,
                    price: q.price,
                    volume: q.volume,
                    source: q.source,
                    status: "FRESH",
                    fetched_at: nowIso,
                    conflict: isChosen && reconciled!.conflict,
                    alt_source: isChosen && reconciled!.conflict ? reconciled!.alternate!.source : null,
                    alt_price: isChosen && reconciled!.conflict ? reconciled!.alternate!.price : null,
                    alt_fetched_at:
                      isChosen && reconciled!.conflict
                        ? reconciled!.alternate!.fetchedAt.toISOString()
                        : null,
                  });
                }
                for (const err of errors) {
                  // getAllQuotes() already console.warn-logs each secondary
                  // source failure — just collect it here, don't re-log.
                  secondaryOut.push({
                    symbol: err.symbol,
                    source: err.source,
                    code: err.code,
                  });
                }
              } catch (err) {
                const e =
                  err instanceof MarketDataError
                    ? err
                    : new MarketDataError("SOURCE_ERROR", symbol, "unknown");
                failOut.push({ symbol, source: e.source, code: e.code });
                console.error(
                  `[snapshot-ingest] skipped ${symbol}: ${e.code} (${e.source})`,
                );
              }
            }),
          );

          return {
            rows: rowsOut,
            failures: failOut,
            secondaryFailures: secondaryOut,
          };
        },
      );

      allRows.push(...rows);
      allFailures.push(...failures);
      allSecondaryFailures.push(...secondaryFailures);

      if (i < chunks.length - 1) {
        await step.sleep(`gap-${i}`, "1s");
      }
    }

    // Decay the PREVIOUS newest snapshot per symbol before inserting the new
    // ones, so the stored `status` reflects how old that row actually got.
    const decayed = await step.run("decay-existing", async () => {
      const supabase = createAdminSupabaseClient();
      // Bound the window: only a row from roughly the last cadence cycle
      // could still need a status correction — anything older either already
      // decayed to STALE (a symbol may sit in the watchlist for months, so
      // without this bound the query scans every historical row every run).
      const recentCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 3x the 5-min cadence
      const { data, error } = await supabase
        .from("market_snapshots")
        .select("id, symbol, fetched_at, status")
        .in("symbol", symbols)
        .gte("fetched_at", recentCutoff)
        .order("fetched_at", { ascending: false });

      if (error) {
        console.warn(`[snapshot-ingest] decay-existing select failed: ${error.message}`);
      }
      if (error || !data) return 0;

      const seen = new Set<string>();
      const now = new Date();
      const updatePromises: PromiseLike<unknown>[] = [];
      for (const row of data) {
        if (seen.has(row.symbol)) continue;
        seen.add(row.symbol);
        const fresh = classifyStaleness(row.fetched_at, now);
        if (fresh !== row.status) {
          updatePromises.push(
            supabase
              .from("market_snapshots")
              .update({ status: fresh })
              .eq("id", row.id),
          );
        }
      }
      // Count queued updates (not resolved results) — same count either way
      // since none of these promises reject the batch on failure.
      await Promise.all(updatePromises);
      return updatePromises.length;
    });

    const inserted = await step.run("insert-snapshots", async () => {
      if (allRows.length === 0) return 0;
      const supabase = createAdminSupabaseClient();
      const { error } = await supabase.from("market_snapshots").insert(allRows);
      if (error) throw new Error(`insert market_snapshots: ${error.message}`);
      return allRows.length;
    });

    return {
      processed: symbols.length,
      inserted,
      decayed,
      failures: allFailures,
      secondaryFailures: allSecondaryFailures,
    };
  },
);
