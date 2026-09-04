# Phase 5: Meaningfulness Engine — Design

Status: approved, ready for implementation plan.

## Goal

Turn Phase 4's raw price/volume diff into a transparent, explainable
meaningfulness score by comparing a stock's move against its own volatility,
the broader market, and its sector — not raw % change alone. Every score
carries a structured explanation. Results persist to `change_events`.

## Components

### 1. Sector reference data — `lib/market-data/sectors.ts`

Static `Record<string, string>` symbol→sector map. ~6 sectors (IT, Banking,
Auto, Pharma, FMCG, Energy) × 5-6 NSE large-caps each. File header comments
this is a deliberate trade-off — no reliable free sector-index API exists —
not an oversight. Exports a helper to look up a symbol's sector, returning
`null` if unmapped (triggers the market-only fallback in scoring).

### 2. Market benchmark

Nifty 50 = `^NSEI`. No source-adapter change needed — `yahoo.ts`'s
`supports()` is unconditionally `true`, and `getQuote`/`getDailyHistory`
accept any ticker string.

`loadWatchlistSymbols()` (`lib/inngest/functions/shared.ts`) is unioned with
a fixed reference-symbol set (`^NSEI` + every symbol in the sector map), so
both existing Inngest jobs (snapshot-ingest, daily-history-backfill) fetch
and store them automatically as ordinary symbols — no special-casing in
storage, only in how the scoring layer uses them.

### 3. Volatility — `lib/scoring/volatility.ts`

Std dev of daily returns over the last 20 `daily_history` rows for a symbol.
Fewer than 20 rows → fallback: raw % change used directly as the "z-score"
input, `volatilityAvailable: false` returned alongside. Threshold of 20
matches phase5.md's own test-2 wording ("less than ~20 days... falls back").

### 4. Sector & market benchmark % move — `lib/scoring/benchmarks.ts`

For a given symbol's diff window, compute the reference series' % move using
`daily_history`: **latest close vs prior close** ("today's session move").
This is the **documented mismatch**: the stock's own raw diff (Phase 4) spans
"last-seen snapshot → now" via `market_snapshots`, an arbitrary-length
window, while market/sector benchmarks use a fixed one-day window. Chosen
deliberately over adding snapshot-matching queries for reference symbols —
avoids over-engineering per phase5.md's explicit "don't over-tune"
instruction. Sector benchmark = average % move across every mapped stock in
that symbol's sector; if the symbol has no sector mapping, sector benchmark
is `null` and only the market benchmark is used (confidence drops — see
below).

### 5. Scoring — `lib/scoring/score.ts`

Pure function, no DB/API calls inside (unit-testable in isolation per
phase5.md task 4):

```
computeMeaningfulness(input: {
  priceDeltaPct: number;
  volumeNow: number | null;
  volumeAvgRecent: number | null; // from daily_history
  dailyVolPct: number | null;     // null when volatilityAvailable is false
  marketDeltaPct: number | null;
  sectorDeltaPct: number | null;  // null when unmapped
}): { score: number; bucket: Bucket; confidence: Confidence; explanation: Explanation }
```

**Z-scoring (core insight):** all three share the same denominator — the
stock's own daily volatility — so they're directly comparable/combinable
without arbitrary rescaling constants:

- `price_zscore = priceDeltaPct / dailyVolPct`
- `market_relative_zscore = (priceDeltaPct - marketDeltaPct) / dailyVolPct`
- `sector_relative_zscore = (priceDeltaPct - sectorDeltaPct) / dailyVolPct`

When `dailyVolPct` is null (insufficient history), fall back to raw
`priceDeltaPct` in place of each z-score (no division), never divide by
zero.

**Weights** (named constants, tunable in one place):

```
{ priceAnomaly: 0.4, volumeAnomaly: 0.2, marketRelative: 0.2, sectorRelative: 0.2 }
```

`volumeAnomaly` input = `max(0, volumeRatio - 1)` where
`volumeRatio = volumeNow / volumeAvgRecent` — only rewards volume surges,
never penalizes below-average volume. `volumeRatio` is `0` contribution if
either volume value is null/zero (documented, not a crash).

`score = priceAnomaly*price_zscore + volumeAnomaly*volume_component + marketRelative*market_relative_zscore + sectorRelative*sector_relative_zscore`
(sector term omitted — weight redistributed to 0 contribution, not
renormalized — when `sectorDeltaPct` is null; simplest defensible choice,
documented as a trade-off, not renormalized to avoid implying false
precision).

**Confidence:**
- `Low` — volatility unavailable (`dailyVolPct` null)
- `Medium` — volatility OK, but sector mapping OR volume data missing
- `High` — all three present

**Buckets** (named constants, tunable): `Urgent` if `score >= 2.0`,
`Notable` if `score >= 0.8`, else `Routine`. Raw weighted-sum scale, not
rescaled to 0-100 (avoids implying false precision).

**Explanation object** (stable field names — Phase 6 renders this directly):

```json
{
  "price_change_pct": number,
  "price_zscore": number,
  "volume_ratio": number | null,
  "market_change_pct": number | null,
  "sector_change_pct": number | null,
  "sector_used": string | null,
  "data_completeness": "full" | "no_sector" | "no_volatility" | "no_volatility_no_sector"
}
```

### 6. Persistence — migration `0004`

`change_events` gains:

```sql
alter table change_events add column snapshot_id uuid references market_snapshots(id);
alter table change_events add constraint change_events_user_symbol_snapshot_key unique (user_id, symbol, snapshot_id);
```

**Dedup policy (user decision):** dedupe by snapshot, not insert-every-reload.
Scoring path upserts on `(user_id, symbol, snapshot_id)` so reloading
`/watchlist` repeatedly doesn't spam duplicate rows for the same underlying
change — mirrors Phase 4's `markWatchlistSeen` idempotency precedent, and
lets Phase 6's digest query "one row per real change."

### 7. Wiring

`computeDiffsForUser` (or a thin wrapper called from the diffs route) computes
the score for every diff where `isFirstView` is `false`, upserts
`change_events` keyed on `(user_id, symbol, current_snapshot_id)`, and the
`GET /api/watchlist/diffs` response includes
`{ score, bucket, confidence, explanation }` per symbol alongside the
existing raw diff fields. First-view symbols get none of these fields —
nothing to score yet. `DiffLine` renders the score/bucket/explanation as
plain text (no digest UI polish — that's Phase 6).

## Testing (phase5.md's 8 acceptance tests)

1. Unit test: scenario (a) choppy stock riding broad rally (+7% stock, +6%
   sector, +5% market, normal volume) scores low/Routine; scenario (b) calm
   stock, flat market, 4x volume (+3% stock, +0.2% sector, +0.1% market,
   4x volume) scores high/Urgent; confirm (b) outranks (a).
2. Symbol with <20 days `daily_history` → graceful fallback (Low confidence,
   raw % used), no crash/NaN/Infinity.
3. Symbol not in sector map → market-only comparison, reduced confidence, no
   crash.
4. Zero/missing volume → volume anomaly handles without divide-by-zero.
5. `change_events` rows created correctly with readable explanation jsonb —
   inspect directly in Supabase.
6. Diffs API includes score/bucket/explanation for every non-first-view
   symbol; first-view symbols have none.
7. 10+ real stocks: scores compute for all without errors/excessive slowdown
   — timed.
8. Manually inspect 3+ real scored examples, confirm bucket matches intuitive
   judgment.

## Explicitly out of scope this phase

- Digest UI redesign (Phase 6) — `DiffLine` gets plain-text score/bucket only.
- Thesis logic (Phase 7).
- News/corporate-event signals (Phase 7+).
- Weight/threshold "optimization" — initial values are a documented,
  defensible trade-off, tuned manually against real data per phase5.md's
  manual steps, not solved analytically.
