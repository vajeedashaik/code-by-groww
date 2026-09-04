import type { Explanation } from "@/lib/scoring/score";
import type { NewsArticle } from "./types";

/** Matches the shape step.ai.infer expects as `body` for a Gemini model (GenerateContentRequest). */
export interface ThesisPromptRequest {
  contents: Array<{ role: "user"; parts: Array<{ text: string }> }>;
  generationConfig: {
    responseMimeType: "application/json";
    responseSchema: object;
    temperature: number;
  };
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["supports", "contradicts", "unclear", "no_new_information", "unavailable"],
    },
    summary: { type: "string" },
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          assessment: { type: "string", enum: ["supports", "contradicts", "neutral"] },
          reasoning: { type: "string" },
        },
        required: ["source", "assessment", "reasoning"],
      },
    },
  },
  required: ["verdict", "summary", "signals"],
};

/**
 * Pure prompt builder — no I/O, testable in isolation. Exact wording is a
 * deliberate manual-tuning target (phase7.md MANUAL STEPS #2), not frozen by
 * this function; only the schema-enforced output shape is load-bearing.
 * Uses Gemini's native structured-output support (responseMimeType +
 * responseSchema) rather than relying on prompt instructions alone to
 * produce valid JSON.
 */
export function buildThesisPrompt(
  thesisText: string,
  companyName: string | null,
  articles: NewsArticle[],
  explanation: Explanation,
): ThesisPromptRequest {
  const newsBlock =
    articles.length === 0
      ? "No recent news articles were found for this stock in the last few days."
      : articles.map((a, i) => `${i + 1}. [${a.source}] ${a.headline}\n   ${a.summary}`).join("\n");

  const marketLine =
    explanation.market_change_pct !== null
      ? `Stock moved ${explanation.price_change_pct.toFixed(2)}% vs Nifty 50 ${explanation.market_change_pct.toFixed(2)}%.`
      : `Stock moved ${explanation.price_change_pct.toFixed(2)}%; no market comparison available.`;
  const sectorLine =
    explanation.sector_used !== null && explanation.sector_change_pct !== null
      ? `Sector (${explanation.sector_used}) moved ${explanation.sector_change_pct.toFixed(2)}%.`
      : "No sector comparison available.";
  const volumeLine =
    explanation.volume_ratio !== null
      ? `Trading volume was ${explanation.volume_ratio.toFixed(1)}x the recent average.`
      : "No volume comparison available.";

  const text = `You are a sharp equity research analyst. A user is watching ${companyName ?? "this stock"} for this stated reason:

"${thesisText}"

The stock was just flagged as a meaningful mover. Market context:
${marketLine}
${sectorLine}
${volumeLine}

Recent news (last few days):
${newsBlock}

Judge whether this new information supports, contradicts, or does not clearly affect the user's stated thesis. If there is no relevant new information, say so plainly with verdict "no_new_information" rather than inventing a confident-sounding answer — no fabricated confidence. Give one assessment per news item (or one item using "price/volume/sector context" as the source if there is no news) plus one overall verdict and a one-line summary.`;

  return {
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  };
}
