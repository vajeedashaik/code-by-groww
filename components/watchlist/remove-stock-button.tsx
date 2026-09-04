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
        className="text-xs text-gray-400 hover:text-red-600"
      >
        Remove
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-gray-600">Remove {symbol}?</span>
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
        className="rounded bg-red-600 px-2 py-0.5 text-white disabled:opacity-50"
      >
        {pending ? "Removing…" : "Confirm"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setConfirming(false)}
        className="rounded border border-gray-300 px-2 py-0.5 text-gray-600"
      >
        Cancel
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </span>
  );
}
