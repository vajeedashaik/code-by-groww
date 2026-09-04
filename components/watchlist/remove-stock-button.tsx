"use client";

import { useState, useTransition } from "react";
import { removeWatchlistItem } from "@/app/(protected)/watchlist/actions";

/**
 * Inline two-step delete: first click reveals Confirm / Cancel, so a stray
 * click never removes a watchlist item.
 */
export default function RemoveStockButton({
  id,
  symbol,
}: {
  id: string;
  symbol: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        className="text-xs text-white/30 transition-colors hover:text-down"
      >
        Remove
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-white/50">Remove {symbol}?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await removeWatchlistItem(id);
            if (!res.ok) {
              setError(res.message ?? "Failed.");
              setConfirming(false);
            }
          })
        }
        className="rounded-full bg-down px-2.5 py-1 text-white shadow-[0_6px_16px_-6px_rgba(255,92,92,0.6)] disabled:opacity-50"
      >
        {pending ? "Removing…" : "Confirm"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setConfirming(false)}
        className="rounded-full border border-white/15 px-2.5 py-1 text-white/60 hover:text-white"
      >
        Cancel
      </button>
      {error && <span className="text-down">{error}</span>}
    </span>
  );
}
