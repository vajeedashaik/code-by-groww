import "server-only";
import { inngest } from "@/lib/inngest/client";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getCompanyNews } from "@/lib/news/finnhub-news";
import { buildThesisPrompt } from "@/lib/thesis/prompt";
import { parseVerdictResponse } from "@/lib/thesis/parse-verdict";
import type { ThesisAnalysis } from "@/lib/thesis/types";
import type { Explanation } from "@/lib/scoring/score";
import type { Json } from "@/types/database";

const MODEL = "gemini-flash-latest";
const NEWS_DAYS = 5;
const NEWS_MAX_ARTICLES = 5;

interface ThesisRelevanceEventData {
  userId: string;
  symbol: string;
  companyName: string | null;
  thesisText: string;
  changeEventId: string;
  explanation: Explanation;
}

/**
 * Judges whether recent news supports/contradicts/is neutral to a user's
 * stated thesis for one flagged stock. Fired by
 * app/api/watchlist/diffs/route.ts, which already applied the cost controls
 * (cap 5, score-priority, already-assessed exclusion — phase7.md task 3)
 * before sending this event. Never touches meaningfulness_score/bucket —
 * this is a fully separate, additive layer (phase7.md's core architectural
 * constraint: the AI verdict must never feed back into the deterministic
 * score).
 */
export const thesisRelevance = inngest.createFunction(
  {
    id: "thesis-relevance-check",
    name: "Thesis relevance check",
    triggers: [{ event: "thesis/relevance.requested" }],
  },
  async ({ event, step }) => {
    const { symbol, companyName, thesisText, changeEventId, explanation } =
      event.data as ThesisRelevanceEventData;

    // Race guard: the diffs route only sends this event when thesis_verdict
    // is null, but the client polls every 5s and Inngest's event-id dedup is
    // best-effort — re-check here before spending an AI call, in case a
    // previous run for this exact change event already finished between
    // send and now.
    const alreadyAssessed = await step.run("check-not-already-assessed", async () => {
      const supabase = createAdminSupabaseClient();
      const { data } = await supabase
        .from("change_events")
        .select("thesis_verdict")
        .eq("id", changeEventId)
        .maybeSingle();
      return Boolean(data?.thesis_verdict);
    });
    if (alreadyAssessed) {
      return { skipped: true, reason: "already assessed" };
    }

    const articles = await step.run("fetch-news", () =>
      getCompanyNews(symbol, { days: NEWS_DAYS, maxArticles: NEWS_MAX_ARTICLES }),
    );

    let analysis: ThesisAnalysis;
    try {
      const prompt = buildThesisPrompt(thesisText, companyName, articles, explanation);
      const response = await step.ai.infer("gemini-verdict", {
        model: step.ai.models.gemini({ model: MODEL }),
        body: prompt,
      });
      const firstPart = response.candidates?.[0]?.content?.parts?.[0];
      const rawText = firstPart && "text" in firstPart ? firstPart.text : undefined;
      analysis = parseVerdictResponse(rawText, {
        days: NEWS_DAYS,
        articleCount: articles.length,
        model: MODEL,
      });
    } catch (err) {
      // Bad/missing API key, quota exhaustion, network failure — degrade
      // gracefully (phase7.md test 7) rather than crash or retry forever.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[thesis-relevance] ${symbol} model call failed: ${message}`);
      analysis = {
        verdict: "unavailable",
        summary: `Verdict unavailable: ${message}`,
        signals: [],
        newsWindow: { days: NEWS_DAYS, articleCount: articles.length },
        assessedAt: new Date().toISOString(),
        model: MODEL,
      };
    }

    await step.run("persist-verdict", async () => {
      const supabase = createAdminSupabaseClient();
      const { data: current } = await supabase
        .from("change_events")
        .select("explanation")
        .eq("id", changeEventId)
        .maybeSingle();

      const baseExplanation =
        current?.explanation && typeof current.explanation === "object" && !Array.isArray(current.explanation)
          ? (current.explanation as Record<string, Json>)
          : {};

      const { error } = await supabase
        .from("change_events")
        .update({
          thesis_verdict: analysis.verdict,
          explanation: { ...baseExplanation, thesis_analysis: analysis as unknown as Json },
        })
        .eq("id", changeEventId);

      if (error) {
        console.error(`[thesis-relevance] ${symbol} persist failed: ${error.message}`);
      }
    });

    return { verdict: analysis.verdict, articleCount: articles.length };
  },
);
