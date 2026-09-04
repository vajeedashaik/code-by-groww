import { cn } from "@/lib/utils";

/** Shimmering glass placeholder block for loading states. */
export default function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/10 bg-white/5",
        className,
      )}
    >
      <div className="absolute inset-0 animate-skeleton-shimmer bg-linear-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
}
