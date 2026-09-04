"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { markWatchlistSeen } from "@/app/(protected)/watchlist/actions";
import { formatElapsed } from "@/lib/watchlist/format-elapsed";
import type { SymbolDiff } from "@/lib/watchlist/diff";
import type { Bucket, Confidence, Explanation } from "@/lib/scoring/score";

/** SymbolDiff plus the Phase 5 fields the diffs API merges in for non-first-view symbols. */
type ScoredDiff = SymbolDiff & {
  score?: number;
  bucket?: Bucket;
  confidence?: Confidence;
  explanation?: Explanation;
};

interface DiffsState {
  diffs: Map<string, ScoredDiff> | null;
  loading: boolean;
}

const DiffsContext = createContext<DiffsState>({ diffs: null, loading: true });

/**
 * Fetches GET /api/watchlist/diffs exactly once for the whole page (not once
 * per row), then fires markWatchlistSeen() only after the diffs are in state
 * and have had a chance to render — marking seen before showing the diff
 * would erase the very change being displayed. If the fetch fails,
 * markWatchlistSeen is never called, so a failed view doesn't consume the
 * unseen state.
 */
export function WatchlistDiffsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<DiffsState>({ diffs: null, loading: true });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/watchlist/diffs");
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body: { diffs: ScoredDiff[] } = await res.json();
        if (cancelled) return;
        setState({
          diffs: new Map(body.diffs.map((d) => [d.symbol, d])),
          loading: false,
        });
        await markWatchlistSeen();
      } catch {
        if (!cancelled) setState({ diffs: null, loading: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DiffsContext.Provider value={state}>{children}</DiffsContext.Provider>
  );
}

const BUCKET_COLOR: Record<Bucket, string> = {
  Urgent: "text-red-600",
  Notable: "text-amber-600",
  Routine: "text-gray-500",
};

/** Renders one symbol's raw diff line plus its Phase 5 score/bucket, as plain text. */
export function DiffLine({ symbol }: { symbol: string }) {
  const { diffs, loading } = useContext(DiffsContext);

  if (loading) {
    return <span className="text-xs text-gray-400">Checking for changes…</span>;
  }
  if (!diffs) return null;

  const diff = diffs.get(symbol);
  if (!diff) return null;

  if (diff.isFirstView) {
    return <span className="text-xs text-gray-400">First time viewing</span>;
  }

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
    pct === null
      ? "no change"
      : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%`;
  const elapsed =
    diff.timeElapsedMs !== null ? formatElapsed(diff.timeElapsedMs) : "";

  return (
    <span className="text-xs">
      <span className={pctColor}>
        {pctLabel} since you last checked{elapsed ? `, ${elapsed}` : ""}
      </span>
      {diff.bucket && (
        <span className={`ml-2 ${BUCKET_COLOR[diff.bucket]}`}>
          [{diff.bucket}, score {diff.score?.toFixed(2)}, {diff.confidence} confidence]
        </span>
      )}
    </span>
  );
}
