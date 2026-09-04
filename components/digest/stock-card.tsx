import type { WatchlistItemMeta } from "@/lib/digest/summarize";
import type { ScoredDiff } from "@/lib/watchlist/scored-diff";
import { formatElapsed } from "@/lib/watchlist/format-elapsed";
import { interpretExplanation } from "@/lib/digest/interpret";
import WhyFlaggedDetail from "@/components/digest/why-flagged-detail";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/** verdict === null (still checking) uses the "pending" key. */
const THESIS_STATUS_LABEL: Record<string, string> = {
  supports: "Mostly intact",
  contradicts: "Contradicted",
  unclear: "Unclear",
  no_new_information: "No new information",
  unavailable: "Unavailable",
  pending: "Checking against your thesis…",
};
const THESIS_STATUS_COLOR: Record<string, string> = {
  supports: "text-green-700",
  contradicts: "text-red-700",
  unclear: "text-amber-700",
  no_new_information: "text-gray-500",
  unavailable: "text-gray-400",
  pending: "text-gray-400",
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
    pct === null
      ? "text-gray-400"
      : pct > 0
        ? "text-green-600"
        : pct < 0
          ? "text-red-600"
          : "text-gray-500";
  const pctLabel =
    pct === null ? "no change" : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%`;
  const elapsed = diff.timeElapsedMs !== null ? formatElapsed(diff.timeElapsedMs) : "";
  const interpretation = diff.explanation ? interpretExplanation(diff.explanation) : null;
  const thesisStatusKey = diff.thesis ? (diff.thesis.verdict ?? "pending") : null;

  return (
    <div className="rounded border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-medium">{item.symbol}</span>
            {item.companyName && (
              <span className="truncate text-sm text-gray-500">{item.companyName}</span>
            )}
          </div>
          {interpretation && <p className="mt-1 text-sm text-gray-700">{interpretation}</p>}
          {elapsed && <p className="mt-1 text-xs text-gray-400">Last checked {elapsed}</p>}
        </div>
        <div className="shrink-0 text-right">
          {diff.priceNow !== null && (
            <div className="font-medium tabular-nums">{inr.format(diff.priceNow)}</div>
          )}
          <div className={`text-xs tabular-nums ${pctColor}`}>{pctLabel}</div>
        </div>
      </div>
      {diff.thesis && thesisStatusKey && (
        <div className="mt-3 rounded bg-gray-50 px-3 py-2 text-sm">
          <p className="text-gray-700">
            <span className="font-medium">Your thesis:</span> {diff.thesis.text}
          </p>
          <p className={`mt-1 text-xs ${THESIS_STATUS_COLOR[thesisStatusKey]}`}>
            Thesis status: {THESIS_STATUS_LABEL[thesisStatusKey]}
          </p>
        </div>
      )}
      {diff.explanation && diff.confidence && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-gray-500">Why is this flagged?</summary>
          <div className="pt-2">
            <WhyFlaggedDetail explanation={diff.explanation} confidence={diff.confidence} thesis={diff.thesis} />
          </div>
        </details>
      )}
    </div>
  );
}
