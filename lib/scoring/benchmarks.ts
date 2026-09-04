/**
 * Pure benchmark math — no DB/API calls. Market/sector benchmarks use
 * daily_history's latest-vs-prior-close ("today's session move"), a
 * documented mismatch against the stock's own arbitrary-length
 * last-seen-to-now diff window — see the Phase 5 design doc. Chosen to
 * avoid over-engineering snapshot-matching for reference symbols.
 */

/** % move from the second-to-last close to the last close. Null if fewer than 2 closes. */
export function computeDailyMovePct(closesOldestToNewest: number[]): number | null {
  if (closesOldestToNewest.length < 2) return null;
  const prior = closesOldestToNewest[closesOldestToNewest.length - 2];
  const latest = closesOldestToNewest[closesOldestToNewest.length - 1];
  if (prior === 0) return null;
  return ((latest - prior) / prior) * 100;
}

/** Average of each sector member's daily move. Null if no member has usable data. */
export function computeSectorBenchmarkPct(
  memberClosesOldestToNewest: number[][],
): number | null {
  const moves = memberClosesOldestToNewest
    .map(computeDailyMovePct)
    .filter((m): m is number => m !== null);
  if (moves.length === 0) return null;
  return moves.reduce((a, b) => a + b, 0) / moves.length;
}
