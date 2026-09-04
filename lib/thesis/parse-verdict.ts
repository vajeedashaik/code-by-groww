import type { ThesisAnalysis, ThesisSignal, ThesisVerdictCategory } from "./types";

const VALID_VERDICTS: ThesisVerdictCategory[] = [
  "supports",
  "contradicts",
  "unclear",
  "no_new_information",
  "unavailable",
];
const VALID_ASSESSMENTS: ThesisSignal["assessment"][] = ["supports", "contradicts", "neutral"];

function unavailable(
  meta: { days: number; articleCount: number; model: string },
  reason: string,
): ThesisAnalysis {
  return {
    verdict: "unavailable",
    summary: `Verdict unavailable: ${reason}`,
    signals: [],
    newsWindow: { days: meta.days, articleCount: meta.articleCount },
    assessedAt: new Date().toISOString(),
    model: meta.model,
  };
}

/**
 * Defensively parses the model's JSON response into a ThesisAnalysis.
 * Never throws — any missing/malformed field degrades to a `"unavailable"`
 * verdict rather than crashing or showing garbled text (phase7.md task 2c).
 * Gemini is asked for `responseMimeType: "application/json"` +
 * `responseSchema` (see lib/thesis/prompt.ts), so malformed JSON should be
 * rare in practice — this is the defense-in-depth layer for when it isn't.
 */
export function parseVerdictResponse(
  rawText: string | undefined,
  meta: { days: number; articleCount: number; model: string },
): ThesisAnalysis {
  if (!rawText) return unavailable(meta, "empty model response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return unavailable(meta, "model response was not valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return unavailable(meta, "model response was not a JSON object");
  }
  const obj = parsed as Record<string, unknown>;

  const verdict = obj.verdict;
  if (typeof verdict !== "string" || !VALID_VERDICTS.includes(verdict as ThesisVerdictCategory)) {
    return unavailable(meta, "model response had no valid verdict field");
  }

  const summary = typeof obj.summary === "string" ? obj.summary : "";

  const signals: ThesisSignal[] = Array.isArray(obj.signals)
    ? obj.signals
        .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
        .map((s) => ({
          source: typeof s.source === "string" ? s.source : "unknown",
          assessment: VALID_ASSESSMENTS.includes(s.assessment as ThesisSignal["assessment"])
            ? (s.assessment as ThesisSignal["assessment"])
            : "neutral",
          reasoning: typeof s.reasoning === "string" ? s.reasoning : "",
        }))
    : [];

  return {
    verdict: verdict as ThesisVerdictCategory,
    summary,
    signals,
    newsWindow: { days: meta.days, articleCount: meta.articleCount },
    assessedAt: new Date().toISOString(),
    model: meta.model,
  };
}
