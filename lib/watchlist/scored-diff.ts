import type { SymbolDiff } from "@/lib/watchlist/diff";
import type { Bucket, Confidence, Explanation } from "@/lib/scoring/score";
import type { ThesisField } from "@/lib/thesis/types";

/** SymbolDiff plus the Phase 5 fields and Phase 7's thesis field the diffs API merges in for non-first-view symbols. */
export type ScoredDiff = SymbolDiff & {
  score?: number;
  bucket?: Bucket;
  confidence?: Confidence;
  explanation?: Explanation;
  /** null when the stock has no thesis; verdict: null inside means "not yet assessed". */
  thesis?: ThesisField | null;
};
