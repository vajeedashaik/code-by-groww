/**
 * Standalone verification for lib/thesis — no jest/vitest in this repo
 * (Phase 2-6 precedent). Run with `npm run verify:thesis`.
 */
import { parseVerdictResponse } from "../lib/thesis/parse-verdict";

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

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll thesis checks passed.");
}
