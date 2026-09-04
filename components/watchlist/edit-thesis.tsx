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
        className="text-xs text-gray-400 hover:text-gray-700"
      >
        Edit thesis
      </button>
    );
  }

  return (
    <div className="mt-1 space-y-1.5">
      <textarea
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-gray-500"
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
          className="rounded bg-gray-900 px-2 py-0.5 text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setEditing(false)}
          className="rounded border border-gray-300 px-2 py-0.5 text-gray-600"
        >
          Cancel
        </button>
        {error && <span className="text-red-600">{error}</span>}
      </div>
    </div>
  );
}
