/**
 * Snapshot freshness grading. Pure, no I/O — safe to call from anywhere.
 *
 * Bands (from phase3.md, kept exactly):
 *   FRESH   age <  2 minutes
 *   DELAYED 2 minutes <= age <= 10 minutes
 *   STALE   age > 10 minutes
 *
 * The cron interval is 5 minutes, so in steady state the newest snapshot is
 * usually DELAYED (last fetch 3–5 min ago). That is honest, not a bug — nothing
 * surfaces this in the UI until Phase 8. This function is the source of truth;
 * the ingest job also writes a best-effort `status` onto rows so the column is
 * populated, but callers that need a correct value should recompute here.
 *
 * This file is the CANONICAL home of `MarketSnapshotStatus`. Task 7 makes
 * `types/database.ts` re-export it (rather than re-declare) so the DB-column
 * contract and this grader can never drift apart.
 */

export type MarketSnapshotStatus = "FRESH" | "DELAYED" | "STALE";

const TWO_MIN_MS = 2 * 60 * 1000;
const TEN_MIN_MS = 10 * 60 * 1000;

export function classifyStaleness(
  fetchedAt: Date | string,
  now: Date = new Date(),
): MarketSnapshotStatus {
  const fetchedMs =
    typeof fetchedAt === "string" ? Date.parse(fetchedAt) : fetchedAt.getTime();
  if (Number.isNaN(fetchedMs)) return "STALE"; // unparseable timestamp -> treat as stale (safe direction)
  const age = now.getTime() - fetchedMs;

  // Deliberate asymmetry: the lower bound is exclusive (age < 2min) and the
  // upper bound inclusive (age <= 10min), matching the plan's verification
  // cases (2min exactly -> DELAYED, 10min exactly -> DELAYED). A negative age
  // (clock skew / future timestamp) intentionally falls through to FRESH.
  if (age < TWO_MIN_MS) return "FRESH";
  if (age <= TEN_MIN_MS) return "DELAYED";
  return "STALE";
}
