import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type Tone = "neutral" | "up" | "down" | "warn" | "pulse";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-white/8 text-white/60 border-white/10",
  up: "bg-up/10 text-up border-up/25",
  down: "bg-down/10 text-down border-down/25",
  warn: "bg-warn/10 text-warn border-warn/25",
  pulse: "bg-pulse/10 text-pulse border-pulse/25",
};

export default function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}
