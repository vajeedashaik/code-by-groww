# Phase 4 — Seen-State & Diffing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track per-user, per-symbol "last seen" snapshot in `user_seen_state`, compute a raw price/volume/time diff against the current snapshot, expose it via a single batched API endpoint, and wire it into `/watchlist` so a returning user sees "what changed since you last checked" before the view is marked seen again.

**Architecture:** A shared batching helper picks the latest `market_snapshots` row per symbol (id included, unlike the Phase 3 page-local helper which only needed price). A pure diff function (`computeDiffsForUser`) does three bounded queries (seen rows, latest snapshots, "then" snapshots by id) — never one query per symbol — and returns a typed `SymbolDiff[]`. `GET /api/watchlist/diffs` exposes that for the client. A new server action `markWatchlistSeen()` re-queries the *current* latest snapshot per symbol at write time (not whatever the client loaded) and upserts on the existing `(user_id, symbol)` primary key — this is the race-condition policy. A small client component fetches the diffs once, renders them per row via React Context (avoiding N fetches for N rows), and calls `markWatchlistSeen()` only after the diffs are already in state — never before.

**Tech Stack:** Next.js 15 App Router (Server Components + Route Handler + Server Action), Supabase (RLS-scoped client only — no service-role client needed, `user_seen_state` already has full CRUD-own RLS policies from Phase 1), TypeScript. No test runner in this repo (Phase 2 deviation, still true) — verification is `tsc --noEmit` + `next build` + manual browser acceptance tests, matching Phase 2/3 practice.

---

### Task 1: Shared "latest snapshot with id" helper

**Files:**
- Create: `lib/watchlist/snapshots.ts`

**Why a new helper instead of reusing `page.tsx`'s `latestSnapshotBySymbol`:** that one only selects `symbol, price, source, fetched_at` (no `id`) because Phase 3's UI never needed to reference a specific snapshot row. Diffing and mark-as-seen both need the row `id` to write into `last_seen_snapshot_id`. Rather than change Phase 3's working, tested code, add a second small helper with the shape this phase needs.

- [ ] **Step 1: Write the helper**

```typescript
// lib/watchlist/snapshots.ts

/**
 * Picks the latest market_snapshots row per symbol from a batch of rows
 * (already filtered to the relevant symbols, ordered or not). On an equal
 * fetched_at, prefers the yahoo row — mirrors the tie-break rule in
 * app/(protected)/watchlist/page.tsx's local latestSnapshotBySymbol.
 */
export interface LatestSnapshot {
  id: string;
  symbol: string;
  price: number;
  volume: number | null;
  source: string;
  fetched_at: string;
}

export function latestSnapshotWithIdBySymbol(
  rows: LatestSnapshot[],
): Map<string, LatestSnapshot> {
  const map = new Map<string, LatestSnapshot>();
  for (const r of rows) {
    const cur = map.get(r.symbol);
    if (
      !cur ||
      r.fetched_at > cur.fetched_at ||
      (r.fetched_at === cur.fetched_at && r.source === "yahoo")
    ) {
      map.set(r.symbol, r);
    }
  }
  return map;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/watchlist/snapshots.ts
git commit -m "feat: latest-snapshot-with-id helper for seen-state/diffing"
```

---

### Task 2: Diff computation function

**Files:**
- Create: `lib/watchlist/diff.ts`

- [ ] **Step 1: Write the function**

```typescript
// lib/watchlist/diff.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { latestSnapshotWithIdBySymbol } from "@/lib/watchlist/snapshots";

/**
 * Raw diff between what a user last saw for a symbol and what's current now.
 * No scoring/meaningfulness judgement — that's Phase 5. `timeElapsedMs` is
 * measured from `seenAt` (when the user last looked), not from the old
 * snapshot's own fetched_at, so the UI can say "4 hours ago" meaning "since
 * you last checked", which is the number a user actually cares about.
 */
export interface SymbolDiff {
  symbol: string;
  isFirstView: boolean;
  priceThen: number | null;
  priceNow: number | null;
  priceDelta: number | null;
  priceDeltaPct: number | null;
  volumeThen: number | null;
  volumeNow: number | null;
  timeElapsedMs: number | null;
  seenAt: string | null;
}

/**
 * Batched, N+1-safe: exactly 3 queries no matter how many symbols. Symbols
 * with no user_seen_state row (or a row whose last_seen_snapshot_id is null
 * — see markWatchlistSeen, which deliberately never writes a null id) come
 * back as isFirstView: true rather than a fake zero-delta.
 */
export async function computeDiffsForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  symbols: string[],
): Promise<SymbolDiff[]> {
  if (symbols.length === 0) return [];

  const [{ data: seenRows }, { data: snapRows }] = await Promise.all([
    supabase
      .from("user_seen_state")
      .select("symbol, last_seen_snapshot_id, seen_at")
      .eq("user_id", userId)
      .in("symbol", symbols),
    supabase
      .from("market_snapshots")
      .select("id, symbol, price, volume, source, fetched_at")
      .in("symbol", symbols)
      .order("fetched_at", { ascending: false })
      .limit(symbols.length * 10),
  ]);

  const currentBySymbol = latestSnapshotWithIdBySymbol(snapRows ?? []);
  const seenBySymbol = new Map((seenRows ?? []).map((r) => [r.symbol, r]));

  const thenIds = [
    ...new Set(
      (seenRows ?? [])
        .map((r) => r.last_seen_snapshot_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  const thenById = new Map<
    string,
    { price: number; volume: number | null; fetched_at: string }
  >();
  if (thenIds.length > 0) {
    const { data: thenRows } = await supabase
      .from("market_snapshots")
      .select("id, price, volume, fetched_at")
      .in("id", thenIds);
    for (const row of thenRows ?? []) {
      thenById.set(row.id, row);
    }
  }

  return symbols.map((symbol) => {
    const current = currentBySymbol.get(symbol) ?? null;
    const seen = seenBySymbol.get(symbol) ?? null;
    const then = seen?.last_seen_snapshot_id
      ? (thenById.get(seen.last_seen_snapshot_id) ?? null)
      : null;

    if (!seen || !then) {
      return {
        symbol,
        isFirstView: true,
        priceThen: null,
        priceNow: current?.price ?? null,
        priceDelta: null,
        priceDeltaPct: null,
        volumeThen: null,
        volumeNow: current?.volume ?? null,
        timeElapsedMs: null,
        seenAt: null,
      };
    }

    const priceNow = current?.price ?? null;
    const priceDelta = priceNow !== null ? priceNow - then.price : null;
    const priceDeltaPct =
      priceDelta !== null && then.price !== 0
        ? (priceDelta / then.price) * 100
        : null;

    return {
      symbol,
      isFirstView: false,
      priceThen: then.price,
      priceNow,
      priceDelta,
      priceDeltaPct,
      volumeThen: then.volume,
      volumeNow: current?.volume ?? null,
      timeElapsedMs: Date.now() - new Date(seen.seen_at).getTime(),
      seenAt: seen.seen_at,
    };
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/watchlist/diff.ts
git commit -m "feat: batched raw diff computation (price/volume/time vs last-seen)"
```

---

### Task 3: `markWatchlistSeen` server action (race-condition policy)

**Files:**
- Modify: `app/(protected)/watchlist/actions.ts`

**Race condition policy (write this as a comment in the code, not just here):** the action takes no snapshot id from the caller at all. It re-queries `market_snapshots` for whatever is latest *at the moment the write happens*, server-side, inside the action itself. So the sequence in the spec (client reads snapshot A, background job writes B, then the stale mark-as-seen request from the A-load fires) resolves correctly: the action doesn't know or care that the client saw A — it looks up "latest now," which is B, and marks B seen. Nothing is silently lost: B was never "unseen and then marked seen without being shown" from the server's point of view, because the server's own query is the source of truth, not the client's stale read. (The UI-level "you didn't get to see B's diff" is an accepted, documented gap — see Task 6/7 notes — not a data-corruption issue.)

A symbol with no snapshot yet is skipped entirely (no row written) so it correctly stays "first view" until real data exists, instead of writing a `last_seen_snapshot_id: null` row that `computeDiffsForUser` would then have to special-case.

- [ ] **Step 1: Add the action**

Add to `app/(protected)/watchlist/actions.ts` (below the existing `removeWatchlistItem`):

```typescript
import { latestSnapshotWithIdBySymbol } from "@/lib/watchlist/snapshots";

/**
 * Marks every symbol in the current user's watchlist as "seen" against
 * whatever snapshot is latest *right now* — re-queried server-side, never
 * trusting a snapshot id from the caller. See the race-condition note in
 * docs/superpowers/plans/2026-09-04-phase4-seen-state-diffing.md Task 3 for
 * why this is safe under concurrent snapshot writes and repeated calls.
 *
 * Idempotent: upserts on the (user_id, symbol) primary key from Phase 1, so
 * rapid repeated calls (double-click, retry) update the same row instead of
 * creating duplicates.
 */
export async function markWatchlistSeen(): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, message: "You must be signed in." };

  const supabase = createServerSupabaseClient();

  const { data: items } = await supabase
    .from("watchlist_items")
    .select("symbol")
    .eq("user_id", userId);
  const symbols = [...new Set((items ?? []).map((i) => i.symbol))];
  if (symbols.length === 0) return { ok: true };

  const { data: snapRows } = await supabase
    .from("market_snapshots")
    .select("id, symbol, price, volume, source, fetched_at")
    .in("symbol", symbols)
    .order("fetched_at", { ascending: false })
    .limit(symbols.length * 10);

  const latestBySymbol = latestSnapshotWithIdBySymbol(snapRows ?? []);
  const seenAt = new Date().toISOString();
  const rows = symbols
    .map((symbol) => {
      const snap = latestBySymbol.get(symbol);
      if (!snap) return null;
      return {
        user_id: userId,
        symbol,
        last_seen_snapshot_id: snap.id,
        seen_at: seenAt,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return { ok: true };

  const { error } = await supabase
    .from("user_seen_state")
    .upsert(rows, { onConflict: "user_id,symbol" });

  if (error) {
    return { ok: false, message: "Couldn't update seen-state." };
  }
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/\(protected\)/watchlist/actions.ts
git commit -m "feat: markWatchlistSeen server action, race-safe idempotent upsert"
```

---

### Task 4: `GET /api/watchlist/diffs` endpoint

**Files:**
- Create: `app/api/watchlist/diffs/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// app/api/watchlist/diffs/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computeDiffsForUser } from "@/lib/watchlist/diff";

/**
 * GET /api/watchlist/diffs
 *
 * Returns the raw diff for every symbol in the current user's watchlist in
 * one response — one query round-trip set (3 queries total, see
 * computeDiffsForUser), not one request per symbol. This is what the
 * /watchlist page's client-side diff panel calls on mount.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data: items, error } = await supabase
    .from("watchlist_items")
    .select("symbol")
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const symbols = [...new Set((items ?? []).map((i) => i.symbol))];
  const diffs = await computeDiffsForUser(supabase, userId, symbols);
  return NextResponse.json({ diffs });
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: exit 0, route listed in build output.

- [ ] **Step 3: Commit**

```bash
git add app/api/watchlist/diffs/route.ts
git commit -m "feat: GET /api/watchlist/diffs endpoint, batched not per-symbol"
```

---

### Task 5: Time-elapsed formatter

**Files:**
- Create: `lib/watchlist/format-elapsed.ts`

**Product decision (manual step 3 from phase4.md):** relative phrasing ("4 hours ago"), not an exact timestamp — matches the casual, glanceable tone the digest (Phase 6) is meant to have, and is what the phase4 brief's own example copy ("since you last checked, 4 hours ago") uses.

- [ ] **Step 1: Write the formatter**

```typescript
// lib/watchlist/format-elapsed.ts

/** Relative "time since last checked" phrasing, e.g. "4 hours ago". */
export function formatElapsed(ms: number): string {
  if (ms < 60_000) return "just now";

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/watchlist/format-elapsed.ts
git commit -m "feat: relative time-elapsed formatter for diff UI"
```

---

### Task 6: Client diff panel (fetch once, render per row, then mark-seen)

**Files:**
- Create: `components/watchlist/diff-panel.tsx`

**Sequencing (task 5 of phase4.md):** the effect fetches diffs, sets state (which renders them), and only *after* that `await` resolves does it call `markWatchlistSeen()`. If the fetch fails, mark-seen is never called — a failed/partial view of the diff should not consume the "unseen" state.

- [ ] **Step 1: Write the component**

```tsx
// components/watchlist/diff-panel.tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { markWatchlistSeen } from "@/app/(protected)/watchlist/actions";
import { formatElapsed } from "@/lib/watchlist/format-elapsed";
import type { SymbolDiff } from "@/lib/watchlist/diff";

interface DiffsState {
  diffs: Map<string, SymbolDiff> | null;
  loading: boolean;
}

const DiffsContext = createContext<DiffsState>({ diffs: null, loading: true });

/**
 * Fetches GET /api/watchlist/diffs exactly once for the whole page (not once
 * per row — see phase4.md acceptance test 6), then fires markWatchlistSeen()
 * only after the diffs are in state and have had a chance to render.
 */
export function WatchlistDiffsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<DiffsState>({ diffs: null, loading: true });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/watchlist/diffs");
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body: { diffs: SymbolDiff[] } = await res.json();
        if (cancelled) return;
        setState({
          diffs: new Map(body.diffs.map((d) => [d.symbol, d])),
          loading: false,
        });
        await markWatchlistSeen();
      } catch {
        if (!cancelled) setState({ diffs: null, loading: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DiffsContext.Provider value={state}>{children}</DiffsContext.Provider>
  );
}

/** Renders one symbol's raw diff line. Reads from the shared fetch above. */
export function DiffLine({ symbol }: { symbol: string }) {
  const { diffs, loading } = useContext(DiffsContext);

  if (loading) {
    return <span className="text-xs text-gray-400">Checking for changes…</span>;
  }
  if (!diffs) return null;

  const diff = diffs.get(symbol);
  if (!diff) return null;

  if (diff.isFirstView) {
    return <span className="text-xs text-gray-400">First time viewing</span>;
  }

  const pct = diff.priceDeltaPct;
  const pctColor =
    pct === null
      ? "text-gray-400"
      : pct > 0
        ? "text-green-600"
        : pct < 0
          ? "text-red-600"
          : "text-gray-500";
  const pctLabel =
    pct === null
      ? "no change"
      : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%`;
  const elapsed =
    diff.timeElapsedMs !== null ? formatElapsed(diff.timeElapsedMs) : "";

  return (
    <span className={`text-xs ${pctColor}`}>
      {pctLabel} since you last checked{elapsed ? `, ${elapsed}` : ""}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/watchlist/diff-panel.tsx
git commit -m "feat: diff panel — single-fetch context, mark-seen after render"
```

---

### Task 7: Wire into `/watchlist` page

**Files:**
- Modify: `app/(protected)/watchlist/page.tsx`

- [ ] **Step 1: Import and wrap**

In `app/(protected)/watchlist/page.tsx`, add the import near the other component imports:

```typescript
import { WatchlistDiffsProvider, DiffLine } from "@/components/watchlist/diff-panel";
```

Wrap the existing `<ul>...</ul>` block (the one under `{items.length > 0 && (...)}`) with the provider, and add a `<DiffLine>` inside each `<li>`. Replace:

```tsx
      {items.length > 0 && (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200">
          {items.map((item) => {
            const snap = priceBySymbol.get(item.symbol);
            return (
              <li key={item.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{item.symbol}</span>
                      {item.company_name && (
                        <span className="truncate text-sm text-gray-500">
                          {item.company_name}
                        </span>
                      )}
                    </div>
                    {item.thesis && (
                      <p className="mt-1 text-sm text-gray-700">{item.thesis}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">
                      Added {formatDate(item.added_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <PriceCell
                      price={snap?.price}
                      prevClose={prevCloseBySymbol.get(item.symbol)}
                    />
                    <RemoveStockButton id={item.id} symbol={item.symbol} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
```

with:

```tsx
      {items.length > 0 && (
        <WatchlistDiffsProvider>
          <ul className="divide-y divide-gray-200 rounded border border-gray-200">
            {items.map((item) => {
              const snap = priceBySymbol.get(item.symbol);
              return (
                <li key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium">{item.symbol}</span>
                        {item.company_name && (
                          <span className="truncate text-sm text-gray-500">
                            {item.company_name}
                          </span>
                        )}
                      </div>
                      {item.thesis && (
                        <p className="mt-1 text-sm text-gray-700">{item.thesis}</p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">
                        Added {formatDate(item.added_at)}
                      </p>
                      <p className="mt-1">
                        <DiffLine symbol={item.symbol} />
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <PriceCell
                        price={snap?.price}
                        prevClose={prevCloseBySymbol.get(item.symbol)}
                      />
                      <RemoveStockButton id={item.id} symbol={item.symbol} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </WatchlistDiffsProvider>
      )}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: exit 0, `/watchlist` route still listed.

- [ ] **Step 3: Commit**

```bash
git add app/\(protected\)/watchlist/page.tsx
git commit -m "feat: show raw diff per stock on /watchlist, mark-seen after render"
```

---

### Task 8: Removed-item seen-state decision (document, no code change)

**Decision:** leave orphaned `user_seen_state` rows in place when a watchlist item is removed (Phase 2's `removeWatchlistItem` is untouched). `computeDiffsForUser` and `markWatchlistSeen` both derive their symbol list from the user's *current* `watchlist_items` (`.eq("user_id", userId)` / the page's own `symbols` list) and query `user_seen_state` filtered `.in("symbol", symbols)` — so an orphaned row for a removed symbol is simply never read or written again. No ghost entries reach the diff API, no error path exists. This mirrors the Phase 3 precedent of leaving `daily_history` rows in place after the smoke test (context.md's Phase 3 section) — dead reference rows are an accepted, harmless gap, not corruption. If a future phase needs cleanup (e.g. a retention job), it can be added without touching this phase's logic.

- [ ] **Step 1: Add a one-line comment to `removeWatchlistItem` noting this**

In `app/(protected)/watchlist/actions.ts`, add to the doc comment above `removeWatchlistItem`:

```typescript
/**
 * ... (existing comment) ...
 *
 * Does not touch user_seen_state — an orphaned row for a removed symbol is
 * harmless: markWatchlistSeen/computeDiffsForUser both derive their symbol
 * list from the user's current watchlist_items, so the orphan is never read
 * or written again.
 */
```

- [ ] **Step 2: Commit**

```bash
git add app/\(protected\)/watchlist/actions.ts
git commit -m "docs: document orphaned-seen-state-row decision on item removal"
```

---

### Task 9: Manual verification pass + docs update

**Files:**
- Modify: `context.md` (Phase 4 section), `README.md` (if it has a per-phase acceptance-tests section, add Phase 4's)

- [ ] **Step 1: Run the automated checks**

```bash
npx tsc --noEmit
npx next build
```
Expected: both exit 0.

- [ ] **Step 2: Run the manual browser tests from phase4.md's TESTING section**

All 8 numbered tests in phase4.md, including the two that need manual Inngest-dashboard triggering (tests 3 and 5) and the Supabase table inspection (tests 4, 5, 7, 8). These require a real Clerk session and cannot be done headlessly — this is the user's step, same as Phase 3's browser tests.

- [ ] **Step 3: Update `context.md`**

Add a "Current state — Phase 4" section following the same structure as the Phase 3 section (What is built / verification / manual steps outstanding / deviations), once the manual tests above have been run and results are known.

- [ ] **Step 4: Commit**

```bash
git add context.md README.md
git commit -m "docs: Phase 4 context update + acceptance tests"
```

---

## Plan self-review notes

- **Spec coverage:** Task 1 mark-as-seen (idempotent upsert) → Task 3. Task 2 race condition → Task 3's re-query-at-write-time policy + comment. Task 3 diff function + first-view flag → Task 2. Task 4 batched endpoint → Task 4. Task 5 UI wiring with correct sequencing → Task 6 + 7. Manual steps → Task 9 (steps 1–2 of phase4.md's MANUAL STEPS are literally manual and can't be scripted; step 3, the "last checked" phrasing decision, is made and documented in Task 5).
- **No test runner:** consistent with the Phase 2 deviation already recorded in context.md — verification is `tsc`/`build`/manual browser tests, not a jest/vitest suite. Not introducing a test framework mid-hackathon for one phase.
- **Type consistency check:** `SymbolDiff` fields (`isFirstView`, `priceThen`, `priceNow`, `priceDelta`, `priceDeltaPct`, `volumeThen`, `volumeNow`, `timeElapsedMs`, `seenAt`) are defined once in Task 2 and used identically in Task 6's `diff-panel.tsx` — no renamed fields across tasks. `latestSnapshotWithIdBySymbol` defined in Task 1, imported by name in Tasks 2 and 3 — same name both places.
