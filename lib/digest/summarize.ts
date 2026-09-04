import type { ScoredDiff } from "@/lib/watchlist/scored-diff";

export interface WatchlistItemMeta {
  symbol: string;
  companyName: string | null;
}

export interface BucketedItem {
  item: WatchlistItemMeta;
  diff: ScoredDiff;
}

export interface BucketedDiffs {
  urgent: BucketedItem[];
  notable: BucketedItem[];
  routine: BucketedItem[];
  newlyAdded: BucketedItem[];
}

/**
 * Groups watchlist items by their current ScoredDiff. An item with no
 * matching diff yet (the fetch hasn't resolved for that symbol, or it's
 * missing from the response) is simply omitted from every bucket rather
 * than guessed at.
 */
export function bucketDiffs(
  items: WatchlistItemMeta[],
  diffs: Map<string, ScoredDiff>,
): BucketedDiffs {
  const result: BucketedDiffs = {
    urgent: [],
    notable: [],
    routine: [],
    newlyAdded: [],
  };

  for (const item of items) {
    const diff = diffs.get(item.symbol);
    if (!diff) continue;

    const entry: BucketedItem = { item, diff };
    if (diff.isFirstView) {
      result.newlyAdded.push(entry);
    } else if (diff.bucket === "Urgent") {
      result.urgent.push(entry);
    } else if (diff.bucket === "Notable") {
      result.notable.push(entry);
    } else if (diff.bucket === "Routine") {
      result.routine.push(entry);
    } else {
      // A non-first-view diff with no bucket means the diffs API failed to
      // merge Phase 5's scoring fields onto this symbol — an upstream
      // contract violation, not a normal state. Fall back to Routine
      // (never silently drop a stock from the digest) and log loudly so
      // the underlying bug is visible instead of invisible.
      console.error(
        `[bucketDiffs] non-first-view diff for ${item.symbol} has no bucket — falling back to Routine`,
      );
      result.routine.push(entry);
    }
  }

  return result;
}

export type SummaryKind = "normal" | "calm" | "first-visit";

export interface Summary {
  kind: SummaryKind;
  text: string;
}

/**
 * The digest's headline. Three distinct cases (phase6.md task 4):
 * - "first-visit": every scored-or-newer item is first-view (nothing has
 *   been scored yet at all) — a brand new watchlist or a fresh user.
 * - "calm": at least one item has been scored, but nothing rose above
 *   Routine — the "attention rationing" product thesis made visible.
 * - "normal": there's at least one Urgent/Notable change to report.
 */
export function summaryLine(bucketed: BucketedDiffs, totalItems: number): Summary {
  const meaningfulCount = bucketed.urgent.length + bucketed.notable.length;
  const hasAnyScored =
    bucketed.urgent.length + bucketed.notable.length + bucketed.routine.length > 0;

  if (!hasAnyScored && bucketed.newlyAdded.length > 0) {
    const n = bucketed.newlyAdded.length;
    return {
      kind: "first-visit",
      text: `${n} stock${n === 1 ? "" : "s"} added — here's your first look.`,
    };
  }

  if (meaningfulCount === 0) {
    return {
      kind: "calm",
      text: "Nothing meaningful changed since you last checked.",
    };
  }

  return {
    kind: "normal",
    text: `${meaningfulCount} meaningful change${meaningfulCount === 1 ? "" : "s"} across ${totalItems} stock${totalItems === 1 ? "" : "s"}.`,
  };
}
