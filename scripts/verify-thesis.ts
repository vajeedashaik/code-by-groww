/**
 * Standalone verification for lib/thesis — no jest/vitest in this repo
 * (Phase 2-6 precedent). Run with `npm run verify:thesis`.
 */
import { parseVerdictResponse } from "../lib/thesis/parse-verdict";
import { selectThesisChecksToRun, type ThesisCandidate } from "../lib/thesis/trigger";
import { buildThesisPrompt } from "../lib/thesis/prompt";
import type { Explanation } from "../lib/scoring/score";

let failures = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`PASS: ${message}`);
  }
}

const meta = { days: 5, articleCount: 2, model: "gemini-2.5-flash" };

// --- parseVerdictResponse ---------------------------------------------------
assert(
  parseVerdictResponse(undefined, meta).verdict === "unavailable",
  "parseVerdictResponse: undefined input -> unavailable",
);

assert(
  parseVerdictResponse("not json{{{", meta).verdict === "unavailable",
  "parseVerdictResponse: invalid JSON -> unavailable",
);

assert(
  parseVerdictResponse("42", meta).verdict === "unavailable",
  "parseVerdictResponse: non-object JSON -> unavailable",
);

assert(
  parseVerdictResponse(JSON.stringify({ summary: "x", signals: [] }), meta).verdict === "unavailable",
  "parseVerdictResponse: missing verdict field -> unavailable",
);

assert(
  parseVerdictResponse(JSON.stringify({ verdict: "made_up", summary: "x", signals: [] }), meta).verdict ===
    "unavailable",
  "parseVerdictResponse: invalid verdict enum value -> unavailable",
);

const goodResponse = parseVerdictResponse(
  JSON.stringify({
    verdict: "supports",
    summary: "EV demand still strong.",
    signals: [{ source: "Reuters: EV sales up", assessment: "supports", reasoning: "Sales beat estimates." }],
  }),
  meta,
);
assert(goodResponse.verdict === "supports", "parseVerdictResponse: valid response parses verdict");
assert(goodResponse.signals.length === 1, "parseVerdictResponse: valid response parses signals");
assert(goodResponse.newsWindow.articleCount === 2, "parseVerdictResponse: newsWindow carries through meta");

const malformedSignal = parseVerdictResponse(
  JSON.stringify({ verdict: "unclear", summary: "x", signals: [{ source: "a" }] }),
  meta,
);
assert(
  malformedSignal.signals[0].assessment === "neutral" && malformedSignal.signals[0].reasoning === "",
  "parseVerdictResponse: signal with missing fields defaults safely instead of throwing",
);

// --- selectThesisChecksToRun -------------------------------------------------
function candidate(overrides: Partial<ThesisCandidate>): ThesisCandidate {
  return {
    symbol: "TEST",
    bucket: "Urgent",
    score: 1,
    changeEventId: "evt-1",
    existingThesisVerdict: null,
    thesisText: "some thesis",
    ...overrides,
  };
}

assert(
  selectThesisChecksToRun([candidate({ bucket: "Routine" })]).length === 0,
  "selectThesisChecksToRun: excludes Routine bucket",
);
assert(
  selectThesisChecksToRun([candidate({ thesisText: null })]).length === 0,
  "selectThesisChecksToRun: excludes stocks with no thesis",
);
assert(
  selectThesisChecksToRun([candidate({ thesisText: "   " })]).length === 0,
  "selectThesisChecksToRun: excludes whitespace-only thesis",
);
assert(
  selectThesisChecksToRun([candidate({ existingThesisVerdict: "supports" })]).length === 0,
  "selectThesisChecksToRun: excludes already-assessed change events",
);
assert(
  selectThesisChecksToRun([candidate({ changeEventId: null })]).length === 0,
  "selectThesisChecksToRun: excludes diffs with no change event id",
);

const many: ThesisCandidate[] = Array.from({ length: 8 }, (_, i) => candidate({ symbol: `S${i}`, score: i }));
const selected = selectThesisChecksToRun(many, 5);
assert(selected.length === 5, "selectThesisChecksToRun: respects the cap");
assert(
  selected.map((c) => c.symbol).join(",") === "S7,S6,S5,S4,S3",
  "selectThesisChecksToRun: picks highest score first",
);

// --- buildThesisPrompt -------------------------------------------------------
const sampleExplanation: Explanation = {
  price_change_pct: 6.2,
  price_zscore: 2.1,
  volume_ratio: 3.4,
  market_change_pct: 0.5,
  sector_change_pct: 0.8,
  sector_used: "IT",
  data_completeness: "full",
};

const promptWithNews = buildThesisPrompt(
  "EV growth + margin improvement",
  "Acme Motors",
  [{ headline: "Acme beats delivery estimates", summary: "Q3 deliveries up 20%.", source: "Reuters", datetime: 1700000000 }],
  sampleExplanation,
);
assert(promptWithNews.contents.length === 1, "buildThesisPrompt: produces one content block");
assert(
  promptWithNews.contents[0].parts[0].text.includes("EV growth + margin improvement"),
  "buildThesisPrompt: includes the thesis text",
);
assert(
  promptWithNews.contents[0].parts[0].text.includes("Acme beats delivery estimates"),
  "buildThesisPrompt: includes news headlines",
);
assert(
  promptWithNews.generationConfig.responseMimeType === "application/json",
  "buildThesisPrompt: forces JSON output via responseMimeType",
);

const promptNoNews = buildThesisPrompt("EV growth", "Acme Motors", [], sampleExplanation);
assert(
  promptNoNews.contents[0].parts[0].text.includes("No recent news"),
  "buildThesisPrompt: states plainly when there is no news, instead of omitting the gap",
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll thesis checks passed.");
}
