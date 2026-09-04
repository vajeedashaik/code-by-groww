"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import type {
  StockSearchResponse,
  StockSearchResult,
} from "@/lib/stocks/types";
import { addWatchlistItem } from "@/app/(protected)/watchlist/actions";

type Feedback = { ok: boolean; text: string } | null;

export default function AddStock() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  const [selected, setSelected] = useState<StockSearchResult | null>(null);
  const [thesis, setThesis] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  const debouncedQuery = useDebounce(query, 350);
  const boxRef = useRef<HTMLDivElement>(null);

  // Fetch results when the debounced query changes.
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 1) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as StockSearchResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setResults(data.results);
        setSearchError(data.error ?? null);
        setOpen(true);
      })
      .catch(() => {
        if (cancelled) return;
        setResults([]);
        setSearchError("Search is temporarily unavailable. Try again shortly.");
        setOpen(true);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(result: StockSearchResult) {
    setSelected(result);
    setOpen(false);
    setQuery("");
    setResults([]);
    setThesis("");
    setTargetPrice("");
    setFeedback(null);
  }

  function submit() {
    if (!selected) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await addWatchlistItem({
        symbol: selected.symbol,
        companyName: selected.name,
        thesis,
        targetPrice,
      });
      setFeedback({ ok: res.ok, text: res.message ?? "" });
      if (res.ok) {
        setSelected(null);
        setThesis("");
        setTargetPrice("");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div ref={boxRef} className="relative">
        <label htmlFor="stock-search" className="sr-only">
          Search stocks
        </label>
        <input
          id="stock-search"
          type="text"
          autoComplete="off"
          placeholder="Search a stock — e.g. Infosys, TCS, RELIANCE.NS"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length || searchError) setOpen(true);
          }}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
        />

        {open && (
          <div className="absolute z-10 mt-1 w-full rounded border border-gray-200 bg-white shadow-lg">
            {searching && (
              <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>
            )}

            {searchError && (
              <div className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {searchError}
              </div>
            )}

            {!searching && results.length === 0 && !searchError && (
              <div className="px-3 py-2 text-sm text-gray-500">
                No matches. Try a different name or symbol.
              </div>
            )}

            <ul className="max-h-64 overflow-y-auto">
              {results.map((r) => (
                <li key={`${r.origin}:${r.symbol}`}>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <span>
                      <span className="font-medium">{r.symbol}</span>
                      <span className="ml-2 text-gray-500">{r.name}</span>
                    </span>
                    {r.origin === "nse-fallback" && (
                      <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                        NSE
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {selected && (
        <div className="rounded border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">{selected.symbol}</span>
              <span className="ml-2 text-gray-500">{selected.name}</span>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <label
                htmlFor="thesis"
                className="block text-xs font-medium text-gray-600"
              >
                Why are you watching this? (optional)
              </label>
              <textarea
                id="thesis"
                rows={2}
                value={thesis}
                onChange={(e) => setThesis(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
              />
            </div>

            <div>
              <label
                htmlFor="target"
                className="block text-xs font-medium text-gray-600"
              >
                Target price (optional)
              </label>
              <input
                id="target"
                type="number"
                min="0"
                step="any"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                className="mt-1 w-40 rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
              />
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add to watchlist"}
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <p
          className={`text-sm ${
            feedback.ok ? "text-green-600" : "text-red-600"
          }`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
