"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { markWatchlistSeen } from "@/app/(protected)/watchlist/actions";
import { formatElapsed } from "@/lib/watchlist/format-elapsed";
import type { Bucket } from "@/lib/scoring/score";
import type { ScoredDiff } from "@/lib/watchlist/scored-diff";

interface DiffsState {
  diffs: Map<string, ScoredDiff> | null;
  loading: boolean;
}

const DiffsContext = createContext<DiffsState>({ diffs: null, loading: true });

const THESIS_POLL_INTERVAL_MS = 5000;
const THESIS_POLL_TIMEOUT_MS = 60000;

function hasPendingThesis(diffs: Map<string, ScoredDiff>): boolean {
  for (const diff of diffs.values()) {
    if (diff.thesis && diff.thesis.verdict === null) return true;
  }
  return false;
}

/**
 * Fetches GET /api/watchlist/diffs exactly once for the whole page (not once
 * per row), then fires markWatchlistSeen() only after the diffs are in state
 * and have had a chance to render — marking seen before showing the diff
 * would erase the very change being displayed. If the fetch fails,
 * markWatchlistSeen is never called, so a failed view doesn't consume the
 * unseen state.
 *
 * Phase 7: after the initial fetch, if any diff has a thesis still awaiting
 * a verdict (thesis.verdict === null), re-fetches every 5s so the "checking
 * against your thesis…" UI state updates without a manual reload — stops
 * once every pending thesis has resolved, or after 60s as a safety cutoff so
 * a stuck job doesn't poll forever. markWatchlistSeen is only ever fired
 * from the very first successful fetch, never from a poll.
 */
export function WatchlistDiffsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<DiffsState>({ diffs: null, loading: true });
  const pollStartRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function fetchOnce(isFirst: boolean) {
      try {
        const res = await fetch("/api/watchlist/diffs");
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body: { diffs: ScoredDiff[] } = await res.json();
        if (cancelled) return;

        const diffs = new Map(body.diffs.map((d) => [d.symbol, d]));
        setState({ diffs, loading: false });
        if (isFirst) await markWatchlistSeen();

        if (pollStartRef.current === null) pollStartRef.current = Date.now();
        const elapsed = Date.now() - pollStartRef.current;
        if (!cancelled && hasPendingThesis(diffs) && elapsed < THESIS_POLL_TIMEOUT_MS) {
          timer = setTimeout(() => fetchOnce(false), THESIS_POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled && isFirst) setState({ diffs: null, loading: false });
      }
    }

    fetchOnce(true);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return <DiffsContext.Provider value={state}>{children}</DiffsContext.Provider>;
}

/**
 * Read the shared diffs fetch (the diffs map + loading flag) from outside
 * DiffLine — used by the Phase 6 digest components so they don't trigger a
 * second fetch or re-derive the mark-as-seen timing.
 */
export function useWatchlistDiffs(): DiffsState {
  return useContext(DiffsContext);
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
