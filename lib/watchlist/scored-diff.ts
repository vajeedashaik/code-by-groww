import type { SymbolDiff } from "@/lib/watchlist/diff";
import type { Bucket, Confidence, Explanation } from "@/lib/scoring/score";

/** SymbolDiff plus the Phase 5 fields the diffs API merges in for non-first-view symbols. */
export type ScoredDiff = SymbolDiff & {
  score?: number;
  bucket?: Bucket;
  confidence?: Confidence;
  explanation?: Explanation;
};
