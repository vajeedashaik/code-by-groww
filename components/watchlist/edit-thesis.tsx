"use client";

import { useState, useTransition } from "react";
import { updateWatchlistThesis } from "@/app/(protected)/watchlist/actions";

/**
 * Inline expand-to-edit for a watchlist item's thesis (phase7.md task 5).
 * Mirrors remove-stock-button.tsx's inline two-step interaction shape — a
 * small text control expands to a form, no modal chrome.
 */
export default function EditThesis({
  id,
  thesis,
}: {
  id: string;
  thesis: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(thesis ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(thesis ?? "");
          setError(null);
          setEditing(true);
        }}
        className="text-xs text-white/30 transition-colors hover:text-pulse"
      >
        Edit thesis
      </button>
    );
  }

  return (
    <div className="mt-1.5 space-y-2">
      <textarea
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-pulse/50"
      />
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await updateWatchlistThesis(id, value);
              if (res.ok) {
                setEditing(false);
              } else {
                setError(res.message ?? "Failed.");
              }
            })
          }
          className="clay-pulse rounded-full px-3 py-1 font-semibold text-black disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setEditing(false)}
          className="rounded-full border border-white/15 px-3 py-1 text-white/60 hover:text-white"
        >
          Cancel
        </button>
        {error && <span className="text-down">{error}</span>}
      </div>
    </div>
  );
}
