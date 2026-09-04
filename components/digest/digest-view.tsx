"use client";

import { useWatchlistDiffs } from "@/components/watchlist/diff-panel";
import { bucketDiffs, summaryLine, type WatchlistItemMeta } from "@/lib/digest/summarize";
import { digestStats, sectorSnapshot } from "@/lib/digest/insights";
import { BlurFade } from "@/components/magicui/blur-fade";
import BucketSection from "@/components/digest/bucket-section";
import NewlyAddedSection from "@/components/digest/newly-added-section";
import StatRow from "@/components/dashboard/stat-row";
import SectorSnapshotCard from "@/components/dashboard/sector-snapshot";
import Skeleton from "@/components/ui/skeleton";
import GlassCard from "@/components/ui/glass-card";

/**
 * Top-level digest assembly. Reads the ALREADY-fetched diffs from
 * useWatchlistDiffs() (Phase 4's provider, unchanged) — no second fetch,
 * no interference with the mark-as-seen timing (phase6.md task 6).
 */
export default function DigestView({ items }: { items: WatchlistItemMeta[] }) {
  const { diffs, loading } = useWatchlistDiffs();

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-2/3" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  }
  if (!diffs) {
    return (
      <GlassCard className="border-down/20 px-4 py-3 text-sm text-down">
        Couldn&apos;t load your digest. Refresh to try again.
      </GlassCard>
    );
  }

  const bucketed = bucketDiffs(items, diffs);
  const summary = summaryLine(bucketed, items.length);
  const stats = digestStats(bucketed);
  const sectors = sectorSnapshot(bucketed);

  return (
    <div className="space-y-8">
      <BlurFade>
        <h1 className="font-display text-2xl font-semibold text-white">{summary.text}</h1>
      </BlurFade>

      <BlurFade delay={0.08}>
        <StatRow stats={stats} />
      </BlurFade>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <BucketSection title="Urgent" tone="urgent" items={bucketed.urgent} defaultOpen variant="card" />
          <BucketSection title="Notable" tone="notable" items={bucketed.notable} defaultOpen variant="card" />
          <BucketSection title="Routine" tone="routine" items={bucketed.routine} defaultOpen={false} variant="compact" />

          {bucketed.newlyAdded.length > 0 && <NewlyAddedSection items={bucketed.newlyAdded} />}
        </div>

        {sectors.length > 0 && (
          <div className="lg:sticky lg:top-24 lg:self-start">
            <SectorSnapshotCard sectors={sectors} />
          </div>
        )}
      </div>
    </div>
  );
}
