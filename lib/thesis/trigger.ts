import type { Bucket } from "@/lib/scoring/score";

export interface ThesisCandidate {
  symbol: string;
  bucket: Bucket;
  score: number;
  /** null when nothing was persisted for this diff (e.g. the change_events upsert failed) — never eligible. */
  changeEventId: string | null;
  /** The change event's current thesis_verdict, straight from the DB. Non-null means already assessed. */
  existingThesisVerdict: string | null;
  thesisText: string | null;
}

const FLAGGED_BUCKETS: Bucket[] = ["Urgent", "Notable"];

/**
 * Which flagged, thesis-bearing stocks get a fresh AI thesis check this
 * diffs-API call. Cost control (phase7.md task 3): only stocks with no
 * existing verdict for their current change event, capped at `cap`,
 * highest-score first. A stock that doesn't make the cut waits for a future
 * change event (e.g. the next snapshot's diff), not this one — see the
 * design doc's Cost/rate control section for why this is safe under polling.
 */
export function selectThesisChecksToRun(
  candidates: ThesisCandidate[],
  cap = 5,
): ThesisCandidate[] {
  return candidates
    .filter(
      (c) =>
        FLAGGED_BUCKETS.includes(c.bucket) &&
        c.changeEventId !== null &&
        c.existingThesisVerdict === null &&
        (c.thesisText ?? "").trim().length > 0,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, cap);
}
