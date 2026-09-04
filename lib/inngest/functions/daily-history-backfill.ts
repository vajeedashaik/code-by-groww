import { inngest } from "@/lib/inngest/client";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getDailyHistory, MarketDataError } from "@/lib/market-data";
import type { DailyBar } from "@/lib/market-data";
import { chunk, loadWatchlistSymbols } from "@/lib/inngest/functions/shared";

/**
 * Daily history backfill. Runs once a day at 01:30 UTC (and on the
 * market/history.requested event). Fetches ~60 calendar days of daily closes
 * per watchlisted symbol and upserts them into daily_history — Phase 5's
 * volatility and sector-benchmark math reads from that table, so it needs real
 * multi-day data now.
 *
 * Same partial-failure contract as snapshot-ingest: one symbol failing is
 * logged and skipped, never fatal. yahoo is the only history source (Finnhub
 * candles are paid).
 *
 * inngest@4 note: createFunction takes (options, handler); the trigger list
 * lives in options.triggers (the older third-positional-arg form is gone).
 */

const CHUNK_SIZE = 5;
// yahoo drops weekends/holidays (~77% yield observed) -> ~45 trading days from 60 calendar days
const HISTORY_DAYS = 60;

interface Failure {
  symbol: string;
  code: string;
}

export const dailyHistoryBackfill = inngest.createFunction(
  {
    id: "daily-history-backfill",
    name: "Daily history backfill",
    triggers: [
      { cron: "30 1 * * *" },
      { event: "market/history.requested" },
    ],
  },
  async ({ step }) => {
    const symbols = await step.run("load-symbols", loadWatchlistSymbols);

    if (symbols.length === 0) {
      return { processed: 0, rowsUpserted: 0, failures: [] as Failure[] };
    }

    const chunks = chunk(symbols, CHUNK_SIZE);
    const allRows: DailyBar[] = [];
    const allFailures: Failure[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const { rows, failures } = await step.run(
        `fetch-chunk-${i}`,
        async () => {
          const rowsOut: DailyBar[] = [];
          const failOut: Failure[] = [];

          await Promise.all(
            chunks[i].map(async (symbol) => {
              try {
                const bars = await getDailyHistory(symbol, HISTORY_DAYS);
                rowsOut.push(...bars);
              } catch (err) {
                const e =
                  err instanceof MarketDataError
                    ? err
                    : new MarketDataError("SOURCE_ERROR", symbol, "unknown");
                failOut.push({ symbol, code: e.code });
                console.error(
                  `[daily-history-backfill] skipped ${symbol}: ${e.code}`,
                );
              }
            }),
          );

          return { rows: rowsOut, failures: failOut };
        },
      );

      allRows.push(...rows);
      allFailures.push(...failures);

      if (i < chunks.length - 1) {
        await step.sleep(`gap-${i}`, "1s");
      }
    }

    const rowsUpserted = await step.run("upsert-history", async () => {
      if (allRows.length === 0) return 0;
      const supabase = createAdminSupabaseClient();
      const { error } = await supabase
        .from("daily_history")
        .upsert(allRows, { onConflict: "symbol,date" });
      if (error) throw new Error(`upsert daily_history: ${error.message}`);
      return allRows.length;
    });

    return { processed: symbols.length, rowsUpserted, failures: allFailures };
  },
);
