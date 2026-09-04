import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computeDiffsForUser } from "@/lib/watchlist/diff";
import { computeAndPersistScores } from "@/lib/scoring/compute-for-diffs";
import { selectThesisChecksToRun, type ThesisCandidate } from "@/lib/thesis/trigger";
import { inngest } from "@/lib/inngest/client";
import type { ThesisField } from "@/lib/thesis/types";

/**
 * GET /api/watchlist/diffs
 *
 * Returns the raw diff for every symbol in the current user's watchlist in
 * one response — one query round-trip set (3 queries total, see
 * computeDiffsForUser), not one request per symbol. This is what the
 * /watchlist page's client-side diff panel calls on mount.
 *
 * Phase 5: also computes and persists a meaningfulness score/bucket/
 * confidence/explanation for every non-first-view diff, merged into each
 * diff's response object. First-view diffs get none of these fields.
 *
 * Phase 7: merges a `thesis` field (text + verdict, null verdict = "not yet
 * assessed") onto each thesis-bearing diff, and — for the highest-scoring up
 * to 5 flagged (Urgent/Notable) thesis-bearing stocks that haven't been
 * assessed yet — fires an idempotent `thesis/relevance.requested` Inngest
 * event (id `${userId}:${symbol}:${changeEventId}`, so repeated calls from
 * the client's 5s poll in diff-panel.tsx never trigger a duplicate model
 * call for the same change event). The event send is awaited (a fast local
 * call to the Inngest dev server/Cloud), but the Inngest function itself is
 * never awaited — this response always returns immediately regardless of
 * Gemini latency (phase7.md task 4's "never block the page load" rule).
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data: items, error } = await supabase
    .from("watchlist_items")
    .select("symbol, thesis, company_name")
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const symbols = [...new Set((items ?? []).map((i) => i.symbol))];
  const thesisBySymbol = new Map((items ?? []).map((i) => [i.symbol, (i.thesis ?? "").trim() || null]));
  const companyNameBySymbol = new Map((items ?? []).map((i) => [i.symbol, i.company_name]));

  const diffs = await computeDiffsForUser(supabase, userId, symbols);
  const scores = await computeAndPersistScores(supabase, userId, diffs);

  const candidates: ThesisCandidate[] = [...scores.entries()].map(([symbol, s]) => ({
    symbol,
    bucket: s.bucket,
    score: s.score,
    changeEventId: s.changeEventId,
    existingThesisVerdict: s.thesisVerdict,
    thesisText: thesisBySymbol.get(symbol) ?? null,
  }));
  const toRun = selectThesisChecksToRun(candidates);

  await Promise.all(
    toRun.map((c) => {
      const score = scores.get(c.symbol);
      if (!score || !c.changeEventId) return Promise.resolve();
      return inngest.send({
        id: `${userId}:${c.symbol}:${c.changeEventId}`,
        name: "thesis/relevance.requested",
        data: {
          userId,
          symbol: c.symbol,
          companyName: companyNameBySymbol.get(c.symbol) ?? null,
          thesisText: c.thesisText,
          changeEventId: c.changeEventId,
          explanation: score.explanation,
        },
      });
    }),
  );

  const merged = diffs.map((diff) => {
    const score = scores.get(diff.symbol);
    const thesisText = thesisBySymbol.get(diff.symbol);

    let thesis: ThesisField | null = null;
    if (thesisText && score) {
      thesis = {
        text: thesisText,
        verdict: (score.thesisVerdict as ThesisField["verdict"]) ?? null,
        summary: score.thesisAnalysis?.summary ?? null,
        signals: score.thesisAnalysis?.signals ?? [],
      };
    }

    if (!score) return { ...diff, thesis };
    return {
      ...diff,
      score: score.score,
      bucket: score.bucket,
      confidence: score.confidence,
      explanation: score.explanation,
      thesis,
    };
  });

  return NextResponse.json({ diffs: merged });
}
