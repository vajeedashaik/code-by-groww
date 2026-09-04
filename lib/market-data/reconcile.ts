import type { Quote } from "@/lib/market-data/types";

/**
 * Dual-source reconciliation policy (phase8.md task 2). Pure, no I/O —
 * called by the snapshot job once per symbol that got more than one quote in
 * the same run (currently only US symbols, where both yahoo and finnhub
 * answer). Documented policy, in priority order:
 *
 *   1. Prefer the source with the more recent `fetchedAt`, if the two differ
 *      by more than RECONCILE_TOLERANCE_MS. Not a "conflict" — just picking
 *      the fresher reading. NOTE (found in code review): with today's
 *      adapters both sources are fetched concurrently in the same job run
 *      (lib/market-data/index.ts's getAllQuotes, under yahoo's 8s / finnhub's
 *      6s timeouts), so the real gap between two Quote.fetchedAt values can
 *      never exceed ~8s — this tier is written for correctness/robustness
 *      against a future slower or sequential adapter, not because it fires
 *      today. Tier 2 (price-threshold + source-priority) is the one that
 *      actually runs in every current demo/run.
 *   2. Otherwise (near-simultaneous, the normal case since both sources are
 *      fetched back-to-back in the same job run) compare price: if the two
 *      disagree by more than CONFLICT_THRESHOLD_PCT, this is a genuine
 *      conflict — both values are kept (the caller stores both rows; the
 *      chosen row also carries the alternate value), and the tie-break is
 *      SOURCE_PRIORITY (yahoo first — it's free, unlimited, and covers every
 *      symbol including NSE, so it's the system's primary source everywhere
 *      else; finnhub is the cross-check). Never averaged, never hidden.
 *   3. If they agree within the threshold, still apply the same
 *      source-priority order (deterministic, not "whichever came back
 *      first") but this is not a conflict.
 */

export const RECONCILE_TOLERANCE_MS = 60_000;
export const CONFLICT_THRESHOLD_PCT = 0.1;
export const SOURCE_PRIORITY = ["yahoo", "finnhub"];

export interface ReconciliationResult {
  chosen: Quote;
  alternate: Quote | null;
  conflict: boolean;
  reason: string;
}

function byPriority(a: Quote, b: Quote): [Quote, Quote] {
  const ai = SOURCE_PRIORITY.indexOf(a.source);
  const bi = SOURCE_PRIORITY.indexOf(b.source);
  return (ai === -1 ? Infinity : ai) <= (bi === -1 ? Infinity : bi) ? [a, b] : [b, a];
}

/** `quotes` must be non-empty. Only the first two are considered (this app has exactly two sources). */
export function reconcileQuotes(quotes: Quote[]): ReconciliationResult {
  if (quotes.length === 0) {
    throw new Error("reconcileQuotes: called with no quotes");
  }
  if (quotes.length === 1) {
    return { chosen: quotes[0], alternate: null, conflict: false, reason: "single source answered" };
  }

  const [a, b] = quotes;
  const timeDeltaMs = Math.abs(a.fetchedAt.getTime() - b.fetchedAt.getTime());

  if (timeDeltaMs > RECONCILE_TOLERANCE_MS) {
    const [newer, older] = a.fetchedAt.getTime() > b.fetchedAt.getTime() ? [a, b] : [b, a];
    return {
      chosen: newer,
      alternate: older,
      conflict: false,
      reason: `${newer.source} reading is ${Math.round(timeDeltaMs / 1000)}s more recent than ${older.source} — preferred on recency, not a conflict`,
    };
  }

  const priceDiffPct = (Math.abs(a.price - b.price) / Math.min(a.price, b.price)) * 100;
  const [primary, secondary] = byPriority(a, b);

  if (priceDiffPct <= CONFLICT_THRESHOLD_PCT) {
    return {
      chosen: primary,
      alternate: secondary,
      conflict: false,
      reason: `${a.source} and ${b.source} agree within ${CONFLICT_THRESHOLD_PCT}% — used ${primary.source} per source priority`,
    };
  }

  return {
    chosen: primary,
    alternate: secondary,
    conflict: true,
    reason: `${a.source} and ${b.source} disagree by ${priceDiffPct.toFixed(3)}% (over the ${CONFLICT_THRESHOLD_PCT}% threshold) within ${Math.round(timeDeltaMs / 1000)}s of each other — kept ${primary.source} per the documented source-priority tie-break (yahoo, then finnhub)`,
  };
}
