"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary — only fires if the root layout itself (ClerkProvider,
 * Header) throws, which app/error.tsx can't catch. Must render its own
 * <html>/<body> since it replaces the root layout entirely.
 */
export default function GlobalError({
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
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[#050506] text-white antialiased">
        <div className="max-w-sm rounded-3xl border border-[#ff5c5c]/20 bg-[#ff5c5c]/[0.06] p-8 text-center backdrop-blur-xl">
          <p className="text-sm font-medium text-[#ff5c5c]">Something went wrong.</p>
          <p className="mt-1.5 text-sm text-white/60">
            The app hit an unexpected error loading. Try again.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 rounded-full bg-linear-to-br from-[#5bffc0] to-[#00a568] px-5 py-2.5 text-sm font-semibold text-black"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
