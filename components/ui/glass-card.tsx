import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/** Base glassmorphic surface used across cards, panels, and rows. */
export default function GlassCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-3xl", className)} {...props} />;
}
