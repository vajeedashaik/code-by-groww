"use client";

import { useWatchlistDiffs } from "@/components/watchlist/diff-panel";
import { bucketDiffs, summaryLine, type WatchlistItemMeta } from "@/lib/digest/summarize";
import BucketSection from "@/components/digest/bucket-section";
import NewlyAddedSection from "@/components/digest/newly-added-section";

/**
 * Top-level digest assembly. Reads the ALREADY-fetched diffs from
 * useWatchlistDiffs() (Phase 4's provider, unchanged) — no second fetch,
 * no interference with the mark-as-seen timing (phase6.md task 6).
 */
export default function DigestView({ items }: { items: WatchlistItemMeta[] }) {
  const { diffs, loading } = useWatchlistDiffs();

  if (loading) {
    return <p className="text-sm text-gray-400">Checking for changes…</p>;
  }
  if (!diffs) {
    return (
      <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        Couldn&apos;t load your digest. Refresh to try again.
      </p>
    );
  }

  const bucketed = bucketDiffs(items, diffs);
  const summary = summaryLine(bucketed, items.length);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{summary.text}</h1>

      <div className="space-y-6">
        <BucketSection title="Urgent" tone="urgent" items={bucketed.urgent} defaultOpen variant="card" />
        <BucketSection title="Notable" tone="notable" items={bucketed.notable} defaultOpen variant="card" />
        <BucketSection title="Routine" tone="routine" items={bucketed.routine} defaultOpen={false} variant="compact" />
      </div>

      {bucketed.newlyAdded.length > 0 && <NewlyAddedSection items={bucketed.newlyAdded} />}
    </div>
  );
}
