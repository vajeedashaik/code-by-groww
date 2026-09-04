/**
 * Shared types for Phase 7's thesis-relevance layer. Kept separate from
 * lib/scoring/score.ts's Explanation/Bucket/Confidence types — the thesis
 * verdict is an additive, optional layer on top of the deterministic score,
 * never merged into it (phase7.md's core architectural constraint).
 */

export type ThesisVerdictCategory =
  | "supports"
  | "contradicts"
  | "unclear"
  | "no_new_information"
  | "unavailable";

export interface ThesisSignal {
  source: string;
  assessment: "supports" | "contradicts" | "neutral";
  reasoning: string;
}

/** Stored at change_events.explanation.thesis_analysis; verdict is duplicated onto change_events.thesis_verdict for simple querying. */
export interface ThesisAnalysis {
  verdict: ThesisVerdictCategory;
  summary: string;
  signals: ThesisSignal[];
  newsWindow: { days: number; articleCount: number };
  assessedAt: string;
  model: string;
}

export interface NewsArticle {
  headline: string;
  summary: string;
  source: string;
  /** Unix seconds, matches Finnhub's own field shape. */
  datetime: number;
}

/** What the diffs API merges onto a ScoredDiff for a thesis-bearing stock. verdict: null means "not yet assessed" (checking...). */
export interface ThesisField {
  text: string;
  verdict: ThesisVerdictCategory | null;
  summary: string | null;
  signals: ThesisSignal[];
}
