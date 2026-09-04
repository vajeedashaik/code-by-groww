"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import type {
  StockSearchResponse,
  StockSearchResult,
} from "@/lib/stocks/types";
import { addWatchlistItem } from "@/app/(protected)/watchlist/actions";
import GlassCard from "@/components/ui/glass-card";
import Button from "@/components/ui/button";

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
          placeholder="Search a stock — e.g. Infosys, RELIANCE.NS"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length || searchError) setOpen(true);
          }}
          className="glass w-full rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-pulse/40"
        />

        {open && (
          <div className="glass-raised absolute z-10 mt-2 w-full overflow-hidden rounded-2xl">
            {searching && (
              <div className="px-3.5 py-2.5 text-sm text-white/45">Searching…</div>
            )}

            {searchError && (
              <div className="border-b border-warn/15 bg-warn/5 px-3.5 py-2 text-xs text-warn">
                {searchError}
              </div>
            )}

            {!searching && results.length === 0 && !searchError && (
              <div className="px-3.5 py-2.5 text-sm text-white/45">
                No matches. Try a different name or symbol.
              </div>
            )}

            <ul className="max-h-64 overflow-y-auto">
              {results.map((r) => (
                <li key={`${r.origin}:${r.symbol}`}>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-white/5"
                  >
                    <span>
                      <span className="font-medium text-white/90">{r.symbol}</span>
                      <span className="ml-2 text-white/45">{r.name}</span>
                    </span>
                    {r.origin === "nse-fallback" && (
                      <span className="shrink-0 rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] tracking-wide text-white/45 uppercase">
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
        <GlassCard className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium text-white/90">{selected.symbol}</span>
              <span className="ml-2 text-white/45">{selected.name}</span>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs text-white/30 hover:text-white/60"
            >
              Cancel
            </button>
          </div>

          <div className="mt-3.5 space-y-3.5">
            <div>
              <label
                htmlFor="thesis"
                className="block text-xs font-medium text-white/45"
              >
                Why are you watching this? (optional)
              </label>
              <textarea
                id="thesis"
                rows={2}
                value={thesis}
                onChange={(e) => setThesis(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-pulse/50"
              />
            </div>

            <div>
              <label
                htmlFor="target"
                className="block text-xs font-medium text-white/45"
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
                className="mt-1.5 w-40 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-pulse/50"
              />
            </div>

            <Button type="button" onClick={submit} disabled={pending} size="md">
              {pending ? "Adding…" : "Add to watchlist"}
            </Button>
          </div>
        </GlassCard>
      )}

      {feedback && (
        <p className={`text-sm ${feedback.ok ? "text-up" : "text-down"}`}>{feedback.text}</p>
      )}
    </div>
  );
}
