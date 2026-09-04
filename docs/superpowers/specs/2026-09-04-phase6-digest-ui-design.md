# Phase 6: "While You Were Away" Digest UI — Design

Status: approved, ready for implementation plan.

## Goal

Replace the plain diff list from Phases 4-5 with a dedicated digest that
opens with a ranked summary of what changed and why, groups stocks into
Urgent/Notable/Routine attention tiers, and offers a per-stock "why is this
flagged?" explainability view — while keeping the existing raw watchlist
table available as a secondary view. Purely a presentation layer over data
Phase 5 already computes; no new scoring logic, no thesis, no staleness UI.

## Route structure

`/dashboard` (currently Phase 1's placeholder "Welcome, {name}" page, no
other feature depends on its content) becomes the digest — the first thing
a signed-in user sees, per phase6.md's "front door" framing. `/watchlist`
keeps its existing Phase 2/4 raw-table view unchanged in substance (search,
add, remove, thesis, price, plain diff line) and remains reachable from the
header nav (already links to both routes) plus a small in-page link on each
page pointing to the other ("View full watchlist" / "Back to digest"). No
JS tab-switcher — two real routes, linked, is simpler and avoids building
a tab component neither phase asked for.

## Architecture: reuse the race-verified provider, don't touch its timing

Phase 4's `WatchlistDiffsProvider` (`components/watchlist/diff-panel.tsx`)
already fetches `/api/watchlist/diffs` once and fires `markWatchlistSeen()`
strictly after the diffs land in state — a previously code-reviewed,
race-condition-safe sequence. The digest must not re-derive or duplicate
this: `DiffsContext` gets exported via a new `useWatchlistDiffs()` hook
(returns `{ diffs: Map<string, ScoredDiff> | null, loading: boolean }`,
identical shape to what `DiffLine` already reads internally) so digest
components can read the same fetched-once data without a second fetch and
without touching the `useEffect`/`setState`/`markWatchlistSeen` ordering at
all. `DiffLine`/`WatchlistDiffsProvider`'s existing bodies are otherwise
unchanged — task 6 of phase6.md ("verify this explicitly") is satisfied by
construction: there is only one fetch-then-mark-seen code path in the whole
app, and the digest is just a new reader of its output.

`/dashboard`'s `page.tsx` (Server Component) fetches `watchlist_items`
(`symbol, company_name, thesis, target_price, added_at`) server-side —
same query shape `/watchlist`'s page already runs — for names and total
watchlist size, then wraps a new client `DigestView` component in
`WatchlistDiffsProvider`, passing the item list as a prop. `DigestView` and
its children read live scores/diffs from `useWatchlistDiffs()` and static
metadata (name, thesis) from the prop — mirroring the existing `/watchlist`
page's own server-fetch + client-diff split.

## Component breakdown

| File | Responsibility |
| --- | --- |
| `components/watchlist/diff-panel.tsx` (modified) | Export `useWatchlistDiffs()` hook alongside existing `WatchlistDiffsProvider`/`DiffLine`. No other change. |
| `lib/digest/interpret.ts` (new) | Pure function `interpretExplanation(explanation: Explanation): string` — the one-line plain-language template rule engine (task 2). No React, no I/O — independently readable/tunable per phase6.md's manual step 2. |
| `lib/digest/summarize.ts` (new) | Pure functions: `bucketDiffs(items, diffs)` groups watchlist items into `{ urgent, notable, routine, newlyAdded }` arrays (each entry pairs the item's static metadata with its `ScoredDiff`); `summaryLine(bucketed)` returns the headline string ("N meaningful changes across M stocks" / calm variant / first-visit variant). Pure data shaping, no rendering — testable the same way Phase 5's scoring math is. |
| `components/digest/digest-view.tsx` (new, client) | Top-level: reads `useWatchlistDiffs()`, calls `bucketDiffs`/`summaryLine`, renders the headline + the four sections in order (Urgent, Notable, Routine, Newly Added) + empty/loading states. |
| `components/digest/bucket-section.tsx` (new, client) | One `<details>`-based section (open by default for Urgent/Notable, closed for Routine) rendering a list of `StockCard`/`RoutineLine`. Hidden entirely (renders nothing) when its item list is empty. |
| `components/digest/stock-card.tsx` (new, client) | Full card for an Urgent/Notable stock: symbol/name, price + % since last seen (from `diff.priceNow`/`priceDeltaPct`), time since last seen (`formatElapsed`), the one-line interpretation, and a `<details>`-based expand for `WhyFlaggedDetail`. |
| `components/digest/routine-line.tsx` (new, client) | Compact single line for a Routine stock: symbol + % change only, no card chrome. |
| `components/digest/why-flagged-detail.tsx` (new, client) | Renders every field of `Explanation` with a plain-language label (Price move, Price z-score, Market comparison, Sector comparison, Volume, Confidence) — the full evidence trail, task 3. |
| `components/digest/newly-added-section.tsx` (new, client) | Lightweight list of first-view symbols — no score/bucket (nothing to score yet), just symbol/name + "First time viewing." |
| `app/(protected)/dashboard/page.tsx` (rewritten) | Server Component: fetch `watchlist_items`, render empty-watchlist state or `DigestView` wrapped in `WatchlistDiffsProvider`. |
| `app/(protected)/watchlist/page.tsx` (small addition) | Add a "Back to digest" link near the page heading. No other change. |

## Bucketing and empty/edge states (task 1, task 4)

While `useWatchlistDiffs().loading` is `true` (the initial fetch hasn't
resolved), `DigestView` renders a single calm loading line ("Checking for
changes…", same phrasing `DiffLine` already uses) instead of any section —
no partial/flickering bucket render before real data arrives.

Once loaded, `bucketDiffs` classifies each watchlist item by its
`ScoredDiff` (looked up by symbol from the context Map; an item with no
matching diff at all post-load — e.g. the fetch failed, `diffs` is `null`
— falls back to the same "couldn't load" treatment `DiffLine` already
shows, not a silently-empty digest):

- `isFirstView: true` → `newlyAdded`.
- else `bucket === "Urgent"` → `urgent`; `"Notable"` → `notable`;
  `"Routine"` → `routine`.

Three distinct states the headline/body must render correctly (task 4):

1. **Normal, mixed watchlist**: headline "N meaningful changes across M
   stocks" (N = urgent.length + notable.length, M = total watchlist items).
   Urgent/Notable sections open by default; Routine collapsed; Newly Added
   shown separately beneath if non-empty.
2. **Zero meaningful changes** (urgent and notable both empty, but routine
   and/or newlyAdded may be non-empty — e.g. right after marking everything
   seen with no new snapshot yet): headline becomes a calm statement (exact
   copy is phase6.md's manual step 3 — starting copy: "Nothing meaningful
   changed since you last checked."). Routine section still renders
   (collapsed) if it has entries — the calm state is about the headline and
   the absence of Urgent/Notable sections, not about hiding data.
3. **First-ever visit** (every non-empty-watchlist item is `isFirstView`,
   so urgent/notable/routine are all empty): headline switches to a
   distinct "first look" copy (starting copy: "N stocks added — here's your
   first look.") and only the Newly Added section renders. This is
   visually and textually distinct from state 2 per phase6.md's explicit
   requirement (test 4) — different headline, different (in fact, only
   one) section shown.

An empty watchlist (zero items) is unchanged from Phase 2's existing empty
state — `/dashboard` shows the same "nothing on your watchlist yet, add a
stock" prompt style already used on `/watchlist`, not a digest-specific
concern.

## One-line interpretation rule engine (task 2)

`interpretExplanation` is an ordered list of rule checks against `Explanation`
fields, first match wins — deliberately simple and easy to read/edit as one
function, since phase6.md's own manual step 2 expects hand-tuning against
real data:

1. No sector data (`sector_used === null`) and no market data
   (`market_change_pct === null`) → "Moved on its own — not enough
   comparison data yet." (rare: only when both benchmarks are missing)
2. High volume (`volume_ratio !== null && volume_ratio >= 2`) AND moved
   independently of available benchmarks (the larger of
   `|price_change_pct - market_change_pct|` and
   `|price_change_pct - sector_change_pct|`, whichever is available, is
   ≥ 1 percentage point) → "Moved independently of the market on unusually
   high volume."
3. High volume, but tracked its benchmarks closely → "Broad move on
   unusually high volume — the whole market/sector moved with it."
4. Moved independently of benchmarks (same ≥1pp test as rule 2), normal
   volume → "Moved independently of its sector and the broader market."
5. Tracked the market/sector closely (within 1pp), normal volume →
   "Mostly tracked the broader market."
6. Fallback (shouldn't normally reach here given 1-5 cover all
   combinations of the two booleans) → "Price moved {price_change_pct}%."

Rule order matters (volume checked first since it's the more surprising
signal); thresholds (`2`, `1`) are named constants in the same file, not
magic numbers, so they're as easy to retune as Phase 5's `SCORE_WEIGHTS`.

## "Why is this flagged?" detail (task 3)

`WhyFlaggedDetail` renders the full `Explanation` object as labeled rows,
not raw JSON:

- Price move: `{price_change_pct}%`
- Price z-score: `{price_zscore.toFixed(2)}σ` (with a one-clause note: "how
  many standard deviations from this stock's normal daily move")
- Market comparison: `market_change_pct !== null` → "Stock {price_change_pct}%
  vs Nifty 50 {market_change_pct}%"; else "No market comparison available"
- Sector comparison: `sector_used !== null` → "Stock {price_change_pct}% vs
  {sector_used} sector {sector_change_pct}%"; else "No sector mapping for
  this stock"
- Volume: `volume_ratio !== null` → "{volume_ratio.toFixed(1)}x normal
  volume"; else "No volume comparison available"
- Confidence: `{diff.confidence}` badge — this is the one place a
  confidence label appears, per phase6.md's explicit carve-out (main digest
  stays free of confidence/staleness badges)

This is inside each Urgent/Notable `StockCard`'s own `<details>`, not a
separate route/modal — keeps it simple, matches "functional, no polish
beyond basic" instruction.

## Visual design direction

Typographic hierarchy: headline as a large, calm statement (not a stat
tile or a big colored number — phase6.md explicitly warns against a
"red/green anxiety-inducing ticker"). Bucket severity gets restrained color
(muted amber for Notable, muted red-brown for Urgent, gray for Routine) on
text/labels only, not full-card backgrounds or badges-as-alarms. Generous
whitespace between sections. Routine and Newly Added sections are
deliberately lower visual weight (smaller text, no card chrome) so the
scannability requirement (task 4, test 5: 15+ stocks stays scannable) comes
from real information hierarchy, not from hiding content. No animations
beyond the browser's native `<details>` open/close.

## What this does NOT do (explicitly out of scope, per phase6.md)

- No thesis display or thesis-relevance verdicts (Phase 7).
- No staleness badges in the main digest (Phase 8); confidence appears only
  inside the why-flagged detail, as Phase 5 already produces it.
- No custom animations/transitions beyond native `<details>` toggling.
- No changes to `markWatchlistSeen`'s timing/sequencing — reused as-is.
