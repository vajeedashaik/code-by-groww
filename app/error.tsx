"use client";

import { useEffect } from "react";
import GlassCard from "@/components/ui/glass-card";
import Button from "@/components/ui/button";

/**
 * Route-level error boundary. Catches any render/throw below the root
 * layout (any page, any client component) so one broken component can't
 * white-screen the whole app — Next.js keeps the header/nav (rendered by
 * layout.tsx, outside this boundary) mounted and shows this in place of the
 * failed page content only.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <GlassCard className="border-down/20 p-8 text-center">
      <p className="text-sm font-medium text-down">Something went wrong.</p>
      <p className="mt-1.5 text-sm text-white/50">
        This page hit an unexpected error. It&apos;s isolated to this view —
        the rest of the app is unaffected.
      </p>
      <Button type="button" onClick={reset} className="mt-5">
        Try again
      </Button>
    </GlassCard>
  );
}
