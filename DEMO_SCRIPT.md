# Demo script

Target: comfortably fit whatever time slot you're given, with room for 1-2
follow-up questions. Rehearse this out loud at least twice, timed, before
presenting (phase9.md manual step 1) — reading it silently doesn't reveal
awkward transitions. Fill in the bracketed `[...]` spots with your actual
test-watchlist symbols/numbers once you've picked your demo data, and swap
the described screens for real screenshots/a live walkthrough.

Narrative beats: **the problem → user leaves → the return → explain one
change → thesis → reliability → closing line.**

---

## 1. The problem (~30s)

> "Every market-watchlist app has the same failure mode: you open it, you
> see a wall of tickers, and you have no idea what actually changed since
> the last time you looked. Everything is either flashing red/green
> constantly, or it's silent and tells you nothing. So you either get
> anxious, or you stop checking — and you miss the one thing that mattered."

Show the landing page (`/`) for two seconds — one line, no chart-vomit.

## 2. User leaves (~20s)

> "Say I'm watching [N] stocks — [mention 1-2 symbols from your demo
> watchlist]. I check it now, then I go do something else for a while."

Show `/watchlist` — the raw table, prices populated, a couple of theses
visible. This is the "before" state.

## 3. The return (~45s)

> "Now I come back. This is `/dashboard` — 'while you were away.'"

Load `/dashboard` live. Point at the one-line headline
(`lib/digest/summarize.ts`'s `summaryLine`) — say the actual text it shows,
e.g. *"2 meaningful changes across 5 stocks."* Point out the three buckets:
**Urgent**, **Notable** (open by default), **Routine** (collapsed, still
there, just not competing for attention).

> "It's not comparing against 'yesterday's close' — it's comparing against
> the *exact snapshot I personally last saw*. And it's not sorting by
> biggest raw move — it's sorting by how unusual that move is *for that
> specific stock*, against the market, against its sector."

## 4. Explain one change (~60s — the core of the demo)

Pick one real Urgent/Notable card from your test data. Click "Why is this
flagged?" to expand `WhyFlaggedDetail`.

> "[SYMBOL] moved [X]%. On its own that might not mean much — but its
> normal daily swing is only [Y]%, so this is a [Z]-sigma move. The market
> was flat, its sector was flat, but volume was [W]x normal — so this is a
> genuinely independent move, not noise riding a broad rally."

Walk through the visible rows one at a time: Price move → Price z-score →
Market comparison → Sector comparison → Volume → Confidence. This is
deliberately the *only* place a confidence label appears — say that out
loud, it's a design choice ("the main card stays a clean read; the receipt
is one click away, never hidden").

If you have a real worked example from your own test data matching the two
documented scenarios, use it: a choppy stock's large move scored
Routine (0.68) despite a 7% move, versus a calm stock's smaller move
scored Urgent (2.94) on a 4x volume surge — that contrast *is* the pitch.

## 5. Thesis (~45s)

Pick a card that has a thesis attached.

> "I told this app why I'm watching [SYMBOL]: '[your thesis text]'. It just
> checked that thesis against the last few days of real news."

Show the thesis status line (Mostly intact / Contradicted / Unclear / No
new information), then expand into the "Thesis analysis" subsection to show
the per-article reasoning.

> "This is the one place AI touches this product. Every score you just saw
> is pure math — reproducible, no black box. Judging whether a headline
> supports or contradicts a sentence a human wrote isn't a math problem, so
> it's isolated here, capped, and if it fails it just says 'unavailable' —
> it never touches the deterministic score."

## 6. Reliability (~40s)

Point at a staleness badge next to a price ("updated 4 minutes ago" —
neutral tone; explain FRESH/DELAYED read the same, calm, because that's
normal operation, not a problem).

If you've exercised the conflict path with your test discrepancy, show the
"Data conflict" block in a detail view: *"The price sources disagreed:
yahoo reported ₹[X], while finnhub reported ₹[Y]. We used yahoo's price per
our documented source-priority rule rather than averaging or hiding it."*

Open the Market Time Machine on one `/watchlist` row — before/after table,
one-line summary.

> "Nothing here is hidden or smoothed over. Stale data lowers confidence
> instead of pretending to be fresh. Disagreeing sources are shown side by
> side instead of averaged into a fake consensus number."

## 7. Closing line (~15s)

> "This isn't another dashboard with more charts. It's the one piece of
> state most market apps throw away between visits — what you already
> saw — turned into the thing that decides what's worth your attention
> next time."

---

## Timing budget

| Section | Target |
| --- | --- |
| The problem | 30s |
| User leaves | 20s |
| The return | 45s |
| Explain one change | 60s |
| Thesis | 45s |
| Reliability | 40s |
| Closing line | 15s |
| **Total** | **~4m15s** |

Leaves headroom in most hackathon slots for 1-2 follow-up questions. If your
slot is shorter, cut section 6 (Reliability) to just the staleness badge —
conflict + Time Machine become "ask me about it" material, not core path.

## Likely hard questions — have 1-2 sentence answers ready, don't improvise

- **"Why didn't you build [notifications/sharing/custom preferences]?"** —
  deliberately deprioritized (P2/P3) to keep the core loop — memory,
  scoring, explainability — solid in 72 hours rather than spreading thin.
- **"How would this scale to 100k users?"** — the batching decisions
  already assume this: diffs/scoring are O(watchlist size) in fixed-count
  queries, not per-symbol round trips. The real bottleneck at that scale is
  the snapshot cron hitting free-tier market-data rate limits, not the app
  logic — see README's "Known limitations."
- **"Why trust an LLM for the thesis check but not the score?"** — the
  score is a reproducible function of numbers; thesis relevance is natural-
  language judgment with no formula. Isolating the fuzzy part instead of
  blending it into the trustworthy part is the whole design decision — see
  README's "Key decisions."
- **"What happens if a data source goes down mid-demo?"** — every external
  call (Yahoo, Finnhub, Gemini) has a timeout and a caught, non-fatal
  failure path; the UI degrades (a stale badge, an "unavailable" thesis
  verdict, a fallback NSE search list) instead of crashing.

## Fallback

Take a short screen recording / screenshots of a clean working run before
your slot (phase9.md manual step 4) — if live internet/deployment misbehaves
in the room, you present the recording instead of debugging live.
