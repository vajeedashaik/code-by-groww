/**
 * Pure volatility math — no DB/API calls. Callers pass in closes already
 * loaded from daily_history, oldest-to-newest.
 */

const VOLATILITY_WINDOW = 20;

/**
 * Std dev of daily % returns over the last 20 closes. Returns null when
 * fewer than 20 closes are available — the caller must fall back to raw %
 * change and flag reduced confidence (phase5.md task 3), never divide by a
 * null/zero volatility.
 */
export function computeVolatilityPct(closesOldestToNewest: number[]): number | null {
  if (closesOldestToNewest.length < VOLATILITY_WINDOW) return null;

  const window = closesOldestToNewest.slice(-VOLATILITY_WINDOW);
  const returns: number[] = [];
  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1];
    if (prev === 0) continue;
    returns.push(((window[i] - prev) / prev) * 100);
  }
  if (returns.length === 0) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

/** Average volume over the last 20 daily_history rows. Null if no usable data. */
export function computeAverageVolume(
  volumesOldestToNewest: (number | null)[],
): number | null {
  const window = volumesOldestToNewest
    .slice(-VOLATILITY_WINDOW)
    .filter((v): v is number => v !== null && v > 0);
  if (window.length === 0) return null;
  return window.reduce((a, b) => a + b, 0) / window.length;
}
