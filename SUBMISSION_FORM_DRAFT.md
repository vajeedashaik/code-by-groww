# Submission Form Draft (temporary — delete after copying into the real form)

---

## Title

**Groww Pulse — the watchlist that remembers what you already saw**

*(Alt, shorter: "Groww Pulse: a watchlist with memory, not just a ticker")*

---

## Theme

**Recommended: FinTech / Personal Finance & Investing tools**

One-sentence justification: the product is a market watchlist with real portfolio-tracking mechanics — price/volume data, volatility-normalized change detection, per-stock investment theses, and email alerts — so it sits squarely in personal-finance/investing tooling rather than general productivity, dev-tools, or social categories.

**⚠️ Confirm against the actual dropdown options in the submission form** — if the hackathon uses different category names (e.g. "AI/ML," "Data & Analytics," "Consumer App"), the closest secondary fit given the one AI touchpoint (Gemini thesis-relevance check) would be a FinTech-first / AI-secondary framing, not the reverse — the AI is one narrow, opt-in feature, not the core mechanism.

---

## Description

*(This is the highest-leverage field — written against the actual judging rubric, not as a generic pitch. Every claim below is backed by a specific file/fact from README.md, context.md, or DEMO_SCRIPT.md.)*

**Groww Pulse is a market watchlist that answers one question the category usually ignores: what actually changed since I last looked?**

Most watchlist apps compete on more data — more charts, more tickers, more noise. Ours competes on memory and attention. It's the only piece of state a dashboard usually throws away between visits ("what did I already see?"), and restoring it is what turns a wall of numbers into a short, honest "here's what changed" — instead of another price ticker flashing red/green at you.

**The three non-negotiables, built exactly as scoped:**
- **Create/manage a watchlist** — add, remove, and attach a personal investment thesis to any symbol (`/watchlist`), backed by Supabase with a `unique(user_id, symbol)` constraint and RLS on every table.
- **View latest market info** — live prices, volume, and a full candlestick chart (1M/3M/6M/1Y interval switcher) per stock, plus a company-insights page (`/stocks/[symbol]`) with analyst ratings, key metrics, and news sentiment.
- **Return later and see what changed** — `/dashboard`, "while you were away": a diff against the *exact snapshot the user last saw* (not "yesterday's close"), bucketed into Urgent / Notable / Routine.

**The differentiator judges will actually remember:** we didn't rank changes by raw size — we built a volatility-normalized "meaningful change" score. A weighted composite of four z-scores (price anomaly 0.4, volume anomaly 0.2, market-relative move 0.2, sector-relative move 0.2), each divided by the stock's own 20-day volatility, so "how unusual is this *for this stock*" drives the ranking, not raw magnitude. We verified this against two worked scenarios before shipping: a choppy 5%/day stock riding a broad +5% rally on a +7% move scores 0.68 (Routine), while a calm 1%/day stock with a flat market and a 4x volume surge on a +3% move scores 2.94 (Urgent) — confirming the engine correctly ranks "genuinely independent move" above "large move that's mostly market noise." (`lib/scoring/score.ts`)

**The five things we had to decide for ourselves — and can defend:**

1. **What counts as a meaningful change** — the z-score composite above, bucketed at `Urgent ≥ 2.0`, `Notable ≥ 0.8`, with the two worked scenarios as proof it isn't just "big move = urgent."
2. **What info to surface** — a one-line headline + three buckets on the digest, with a "Why is this flagged?" detail view as the *only* place raw evidence (price z-score, market/sector comparison, volume ratio, confidence) appears — the main card stays a clean read, the receipt is one click away, never hidden.
3. **How state persists across sessions/devices** — everything lives in Supabase, keyed by Clerk `user_id`, RLS-enforced on every table (watchlist items, seen-state, alerts, thesis text). Zero `localStorage`/`sessionStorage` anywhere in the client code (confirmed by grep) — sign in on a different device and the watchlist, digest history, and alerts are already there.
4. **How stale/conflicting data is handled** — price freshness is banded (FRESH < 2 min, DELAYED 2–10 min, STALE > 10 min) and shown as a badge; a STALE reading forces that change's confidence down to Low, never scored as if reliable. When Yahoo and Finnhub disagree on a US-listed symbol's price by more than 0.1% at roughly the same moment, neither value is averaged or hidden — both are kept, Yahoo's is used (documented priority: free, unlimited, covers every symbol tracked including NSE), and the disagreement is shown in the "why is this flagged?" detail view, with a fixed source-priority tie-break (`lib/market-data/reconcile.ts`).
5. **How it scales** — the diffs API and scoring pipeline are batched: a fixed small number of queries regardless of watchlist size (`lib/watchlist/diff.ts`, `lib/scoring/history.ts`), re-confirmed at the code level twice. Known, documented limitation: real load-time numbers at 30-50 stocks haven't been measured yet against a live account — stated honestly in README's "Known limitations," not hidden.

**On the five judging dimensions:**

- **Engineering Depth** — a real scoring engine (volatility-normalized z-scores, not a threshold on raw %), a real reconciliation policy for dual-source conflicts, durable scheduled jobs via Inngest (5-minute cron), and real email delivery via Resend for price/volume alerts with cooldown gating — not a UI stub.
- **Product & Problem Interpretation** — the core insight (restoring "what did I last see" is the actual missing feature in this category) is stated explicitly and built as the primary UI surface (`/dashboard`), not bolted on.
- **Edge Cases & Resilience** — every external call (Yahoo, Finnhub, Gemini) has a timeout and a caught, non-fatal failure path; the UI degrades (a stale badge, an "unavailable" thesis verdict, a fallback NSE search list) instead of crashing. A route-level error boundary keeps one broken component from white-screening the whole app.
- **Code Quality & Simplicity** — one Next.js app + Supabase + Inngest, deliberately not microservices (solo, 72 hours, one request path — the coordination overhead would have no payoff at this scale). Pure-logic modules (`lib/scoring/`, `lib/market-data/reconcile.ts`, `lib/alerts/evaluate.ts`) are separated from orchestration and covered by five `verify:*` scripts that run in CI on every push.
- **Originality & Thoughtfulness** — the AI is used exactly once, and deliberately narrowly: a Gemini call judges whether recent news supports or contradicts a user's own free-text investment thesis — isolated from the deterministic score entirely (never merged into `meaningfulness_score`/`bucket`), capped at 5 checks per digest load, and degrades to "unavailable" on any failure. Every other signal is deterministic and reproducible from raw numbers — the fuzzy, unformulaic part of the problem is the only part handed to an LLM.

Built solo in a 72-hour hackathon. Stack: Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Clerk (auth) · Supabase (Postgres + RLS) · Inngest (scheduled jobs) · yahoo-finance2 + Finnhub (market data) · Gemini (the one AI touchpoint).

---

## Video URL

`[ ] PLACEHOLDER — paste demo video link here once recorded/uploaded. Not yet filled.`

---

## Demo Link

`[ ] PLACEHOLDER — this project is local-demo-only per project decision (no deploy this hackathon, per context.md Phase 9 notes). Confirm whether a live link is required or whether "local demo only" is an acceptable answer for this field before submitting.`

---

## Repository URL

`[ ] PLACEHOLDER — confirm exact GitHub URL (context.md references vajeedashaik/code-by-groww as the origin remote). Paste the real, final URL here.`

---

## Instructions to Run

*(Pulled directly from README.md's "Run it locally" section — verify no steps changed before copying.)*

**Prerequisites:**
- Node 20+ and npm
- A [Clerk](https://dashboard.clerk.com) account
- A [Supabase](https://supabase.com/dashboard) project
- A free [Finnhub](https://finnhub.io) API key
- A free [Gemini](https://aistudio.google.com/apikey) API key

**Steps:**

1. **Clerk** — create an application, copy the Publishable + Secret key from **API Keys**.
2. **Supabase** — create a project, copy the Project URL + anon key + service_role key from **Project Settings → API**.
3. **Run the migrations** — in the Supabase SQL Editor, run every file in `supabase/migrations/` in order (`0001` → `0005`), or run `supabase/schema.sql` once for the same result.
4. **Wire Clerk ↔ Supabase** — Supabase **Authentication → Sign In / Providers → Third Party Auth → Add provider → Clerk**, follow the "Connect with Supabase" flow, save the Clerk domain it gives you.
5. **Env vars** — `cp .env.example .env.local`, fill every value (Clerk, Supabase, `FINNHUB_API_KEY`, `GEMINI_API_KEY`). *(If a `RESEND_API_KEY` is set up for email alerts, include it too — alerts degrade to "logged, not emailed" without it.)*
6. **Run:**
   ```bash
   npm install
   npm run dev        # terminal 1 — app on :3000
   npm run inngest     # terminal 2 — Inngest dev server + dashboard on :8288
   ```
7. Open `http://localhost:3000`, sign in, add a stock. Prices/scores populate once the Inngest snapshot job runs (every 5 minutes on its own, or trigger it immediately: visit `/api/dev/trigger?job=snapshot` while signed in, or use the **Invoke** button in the Inngest dashboard).

---

## Snapshots

`[ ] PLACEHOLDER — file upload, not fillable here. Checklist:`
- `[ ] Landing page`
- `[ ] /dashboard digest (Urgent/Notable/Routine buckets visible)`
- `[ ] "Why is this flagged?" detail view expanded`
- `[ ] Thesis + AI relevance verdict on a stock card`
- `[ ] /watchlist with staleness badge and/or alert badge visible`
- `[ ] /stocks/[symbol] company insights + candlestick chart`

## Source Code

`[ ] PLACEHOLDER — file upload, not fillable here. Zip the repo (exclude node_modules/.next/.env.local) before uploading.`
