"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import type { WatchlistItemMeta } from "@/lib/digest/summarize";
import type { ScoredDiff } from "@/lib/watchlist/scored-diff";
import { formatElapsed } from "@/lib/watchlist/format-elapsed";
import { interpretExplanation } from "@/lib/digest/interpret";
import WhyFlaggedDetail from "@/components/digest/why-flagged-detail";
import StalenessBadge from "@/components/watchlist/staleness-badge";
import { BorderBeam } from "@/components/magicui/border-beam";
import CandlestickChart from "@/components/charts/candlestick-chart";
import type { ThesisVerdictCategory } from "@/lib/thesis/types";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

type ThesisStatusKey = ThesisVerdictCategory | "pending";

/** verdict === null (still checking) uses the "pending" key. Record<ThesisStatusKey, ...> so a new/renamed ThesisVerdictCategory fails the build here instead of silently rendering blank. */
const THESIS_STATUS_LABEL: Record<ThesisStatusKey, string> = {
  supports: "Mostly intact",
  contradicts: "Contradicted",
  unclear: "Unclear",
  no_new_information: "No new information",
  unavailable: "Unavailable",
  pending: "Checking against your thesis…",
};
const THESIS_STATUS_COLOR: Record<ThesisStatusKey, string> = {
  supports: "text-up",
  contradicts: "text-down",
  unclear: "text-warn",
  no_new_information: "text-white/40",
  unavailable: "text-white/35",
  pending: "text-white/35",
};

/**
 * Full card for an Urgent/Notable stock: symbol/name, price + % since last
 * seen, time since last seen, a one-line interpretation, and an expandable
 * full evidence trail (phase6.md task 2/3).
 *
 * Phase 7: if the stock has a thesis, shows the thesis text plus its verdict
 * status (or "Checking against your thesis…" while the async job runs —
 * phase7.md task 4). Stocks with no thesis render exactly as before.
 */
export default function StockCard({
  item,
  diff,
}: {
  item: WatchlistItemMeta;
  diff: ScoredDiff;
}) {
  const pct = diff.priceDeltaPct;
  const pctColor =
    pct === null ? "text-white/35" : pct > 0 ? "text-up text-glow-up" : pct < 0 ? "text-down text-glow-down" : "text-white/50";
  const pctLabel =
    pct === null ? "no change" : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%`;
  const elapsed = diff.timeElapsedMs !== null ? formatElapsed(diff.timeElapsedMs) : "";
  const interpretation = diff.explanation ? interpretExplanation(diff.explanation) : null;
  const thesisStatusKey = diff.thesis ? (diff.thesis.verdict ?? "pending") : null;
  const isUrgent = diff.bucket === "Urgent";
  const [chartOpen, setChartOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="glass relative overflow-hidden rounded-3xl p-4 sm:p-5"
    >
      {isUrgent && <BorderBeam duration={7} size={70} colorFrom="#ff5c5c" colorTo="#ffb020" />}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <Link
              href={`/stocks/${encodeURIComponent(item.symbol)}`}
              className="font-display font-semibold text-white hover:text-pulse"
            >
              {item.symbol}
            </Link>
            {item.companyName && <span className="truncate text-sm text-white/45">{item.companyName}</span>}
          </div>
          {interpretation && <p className="mt-1.5 text-sm text-white/70">{interpretation}</p>}
          {elapsed && <p className="mt-1 text-xs text-white/30">Last checked {elapsed}</p>}
        </div>
        <div className="shrink-0 text-right">
          {diff.priceNow !== null && (
            <div className="font-display font-medium tabular-nums text-white">{inr.format(diff.priceNow)}</div>
          )}
          <div className={`text-xs tabular-nums ${pctColor}`}>{pctLabel}</div>
          <div className="mt-1">
            <StalenessBadge fetchedAt={diff.currentSnapshotFetchedAt} />
          </div>
        </div>
      </div>
      {diff.thesis && thesisStatusKey && (
        <div className="mt-3 rounded-2xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5 text-sm">
          <p className="text-white/70">
            <span className="font-medium text-white/85">Your thesis:</span> {diff.thesis.text}
          </p>
          <p className={`mt-1 text-xs ${THESIS_STATUS_COLOR[thesisStatusKey]}`}>
            Thesis status: {THESIS_STATUS_LABEL[thesisStatusKey]}
          </p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => setChartOpen((v) => !v)}
          className="text-xs text-white/40 transition-colors hover:text-pulse"
        >
          {chartOpen ? "Hide chart" : "Chart"}
        </button>
        {diff.explanation && diff.confidence && (
          <details className="group w-full sm:w-auto">
            <summary className="cursor-pointer text-xs text-white/40 transition-colors hover:text-white/70">
              Why is this flagged?
            </summary>
            <div className="pt-3">
              <WhyFlaggedDetail
                explanation={diff.explanation}
                confidence={diff.confidence}
                thesis={diff.thesis}
                currentPrice={diff.priceNow}
                usedSource={diff.usedSource}
              />
            </div>
          </details>
        )}
      </div>
      {chartOpen && (
        <div className="mt-3">
          <CandlestickChart symbol={item.symbol} height={180} />
        </div>
      )}
    </motion.div>
  );
}
