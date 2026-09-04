import { cn } from "@/lib/utils";

/** Groww Pulse wordmark — animated EKG-style pulse line as the mark. */
export default function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display font-semibold tracking-tight", className)}>
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-xl clay">
        <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-xl bg-pulse/40" />
        <svg viewBox="0 0 32 20" className="relative h-4 w-5" fill="none" aria-hidden="true">
          <path
            d="M0 10H8L11 3L15 17L19 7L21 10H32"
            stroke="var(--color-pulse)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={0}
            className="drop-shadow-[0_0_6px_rgba(0,208,132,0.9)]"
          />
        </svg>
      </span>
      <span className="text-lg leading-none">
        <span className="text-white">Groww</span>
        <span className="text-pulse"> Pulse</span>
      </span>
    </span>
  );
}
