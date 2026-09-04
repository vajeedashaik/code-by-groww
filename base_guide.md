# Signalist — Feature-by-Feature Build Guide

Scope: how this repo builds (or doesn't build) the 7 features you listed, with exact files/functions, so you can replicate on your own site. Verified against `main @ 9701387` on 2026-09-04.

Status key: ✅ built and working · ⚠️ partially built · ❌ not built (types/templates/stubs only)

---

## 1. Stock dashboard with live prices streaming 

**What actually exists:** `app/(root)/page.tsx` renders 4 `TradingViewWidget` islands (Market Overview, Heatmap, Top Stories, Market Quotes). All quote data comes from TradingView's own third-party `<script>` — the app never fetches or holds a live price itself. There is no WebSocket, no polling, no server-pushed price anywhere in the code.

**How the embed mechanism works** (`hooks/useTradingViewWidget.tsx`):
```
1. containerRef holds a <div>
2. On mount, inject: <div class="tradingview-widget-container__widget">
3. Create <script async src={scriptUrl}> with innerHTML = JSON.stringify(config)
4. Append script into container; TradingView's script self-boots the widget
5. dataset.loaded guards against double-init; cleanup wipes innerHTML on unmount
```
`components/TradingViewWidget.tsx` wraps this in `memo()` and takes `{ scriptUrl, config, height, className }`. Widget configs (colors, symbols, tabs) live as plain objects/factories in `lib/constants.ts` (`MARKET_OVERVIEW_WIDGET_CONFIG`, `HEATMAP_WIDGET_CONFIG`, etc.), all hard-coded `colorTheme: 'dark'`.

**To replicate real live streaming on your own site**, you need first-party data — TradingView embeds can't give you that. Recipe using the stack already in this repo:
- Finnhub has a WebSocket endpoint: `wss://ws.finnhub.io?token=<key>`. Subscribe per symbol: `{"type":"subscribe","symbol":"AAPL"}`. It pushes `{"type":"trade","data":[{"s":"AAPL","p":price,"v":volume,"t":timestamp}]}`.
- Client can't hold a Finnhub-authenticated socket safely if the key is server-only — either use the public key client-side (Finnhub allows this for the free tier) in a `'use client'` component, or proxy through a Next.js Route Handler using Server-Sent Events (`ReadableStream` + `text/event-stream`) that itself holds one shared upstream WebSocket and fans out to N browser tabs.
- State: keep a `Map<symbol, price>` in a client store (Zustand/Jotai) updated on each message; render tiles/rows off it. Debounce re-renders to ~250ms if subscribing to many symbols.
- Fallback to REST polling (`/quote?symbol=`) with `next: {revalidate: 5-15}` for symbols not on a live tier, or when the socket drops.

---

## 2. Interactive candlestick charts with smart filters — ⚠️ CHART YES, FILTERS NO (all TradingView's)

`app/(root)/stocks/[symbol]/page.tsx` renders `CANDLE_CHART_WIDGET_CONFIG(symbol)` through the same `TradingViewWidget` + `useTradingViewWidget` mechanism as above, using the `advanced-chart` embed script with `style: 1` (candles). A second `BASELINE_WIDGET_CONFIG` (`style: 10`) renders a baseline/area variant of the same symbol.

```ts
// lib/constants.ts
export const CANDLE_CHART_WIDGET_CONFIG = (symbol: string) => ({
  style: 1, interval: 'D', symbol: symbol.toUpperCase(),
  theme: 'dark', hide_side_toolbar: true, hide_top_toolbar: false,
  studies: [], compareSymbols: [], watchlist: [], withdateranges: false,
  backgroundColor: '#141414', gridColor: '#141414', width: '100%', height: 600,
});
```
Any "smart filters" (interval switch, indicators, drawing tools) you see when running the app are TradingView's own widget chrome (`hide_top_toolbar: false` keeps their toolbar) — none of it is app code. `studies: []` and `compareSymbols: []` are empty, so no indicators are pre-loaded.

**To replicate with your own filters/interactivity** (own candlestick UI instead of an iframe), you'd drop the TradingView embed for a first-party chart:
- Data: Finnhub `/stock/candle?symbol=&resolution=&from=&to=` (resolution: `1,5,15,30,60,D,W,M`) returns `{c,h,l,o,t,v,s}` arrays — map to OHLCV bars.
- Render: `lightweight-charts` (TradingView's own open-source lib, MIT) or `recharts`/`visx` for candlesticks — `lightweight-charts` is purpose-built and free.
- "Smart filters" = your own UI state: interval buttons (1D/1W/1M/1Y) refetch candle range; indicator toggles (SMA/EMA/RSI) computed client-side over the same OHLCV array; a compare-symbol multi-select overlays a second series.
- This is real work TradingView currently does for free via the embed — only do it if you need filter/indicator logic the embed doesn't expose, or want to remove the third-party script dependency.

---

## 3. Powerful search feature to find stocks — ✅ BUILT (this one's real)

**Flow:** `components/SearchCommand.tsx` (client) → `searchStocks()` server action in `lib/actions/finnhub.actions.ts` → Finnhub REST.

Key mechanics:
- **Command palette UI**: shadcn/`cmdk` (`CommandDialog`, `CommandInput`, `CommandList`). Global `⌘K` / `Ctrl+K` keydown listener toggles `open` (`SearchCommand.tsx:20-29`).
- **Debounce**: `hooks/useDebounce.ts` wraps `handleSearch` in a 300ms `setTimeout` reset on each keystroke; triggered by `useEffect([searchTerm])`.
- **Empty query = "browse mode"**: `searchStocks()` with no arg fetches Finnhub `stock/profile2` for the first 10 of a hard-coded `POPULAR_STOCK_SYMBOLS` list (`lib/constants.ts`, ~50 tickers), in parallel via `Promise.all`, revalidated hourly (`fetchJSON(url, 3600)`).
- **Non-empty query**: hits Finnhub `/search?q=` directly, revalidated every 30 min (`fetchJSON(url, 1800)`).
- **Caching**: `searchStocks` is wrapped in React's `cache()` so repeated calls within one request/render pass are deduped.
- **Result shape**: mapped to `{symbol, name, exchange, type, isInWatchlist}`, capped at 15, sorted as returned by Finnhub (no client-side ranking).
- **Seed data**: `components/Header.tsx` is an async server component that calls `searchStocks()` once per page load (no query) and passes the popular-stocks list down as `initialStocks` — so the palette has content before the user types anything.
- Error handling: `searchStocks` never throws — returns `[]` on any failure so the UI degrades to "No stocks available" instead of crashing.

**To replicate:** this pattern is solid and copy-worthy as-is — cmdk + server action + debounce + `React.cache()` + hourly/30-min TTL via `next.revalidate`. The one bug to fix, not copy: `useDebounce`'s returned callback is recreated every render (defeats memoization) — it only works because the `useEffect` dependency array re-triggers it anyway. Add symbol-prefix ranking or a fuzzy-match (Fuse.js) client-side over Finnhub's `/search` results if you want better relevance than Finnhub's own ordering.

---

## 4. Watchlist and alerts with personalized stocks — ❌ NOT BUILT (stub + dead schema)

**What exists:**
- `database/models/watchlist.model.ts` — a real Mongoose schema: `{ userId: string (indexed), symbol: string (upper/trim), company: string, addedAt: Date }`, compound unique index on `{userId, symbol}`.
- `lib/actions/watchlist.actions.ts` — **read-only**: `getWatchlistSymbolsByEmail(email)` looks up the Better Auth `user` collection by email to get `id`, then `Watchlist.find({userId})`, returns `string[]` of symbols.
- `components/WatchlistButton.tsx` — **pure UI stub**. Local `useState<boolean>(isInWatchlist)`, toggles on click, calls an optional `onWatchlistChange` callback. **No network call, no server action, no persistence** — refresh the page and it resets.
- **Nothing writes to the `Watchlist` collection anywhere in the codebase.** No add/remove server action exists. `/watchlist` route is commented out in `NAV_ITEMS` (`lib/constants.ts:4`) and there is no `app/(root)/watchlist/page.tsx`.
- Types for a full watchlist table (`WatchlistTableProps`, `StockWithData`) and for alerts (`Alert`, `AlertData`, `AlertModalProps`, `AlertsListProps`) exist in `types/global.d.ts` — a UI contract with zero backing code.

**To replicate a real watchlist**, the schema here is a fine starting point. Add:
```ts
// lib/actions/watchlist.actions.ts — new exports
export async function addToWatchlist(symbol: string, company: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('Unauthorized');
  await connectToDatabase();
  await Watchlist.updateOne(
    { userId: session.user.id, symbol: symbol.toUpperCase() },
    { $setOnInsert: { company, addedAt: new Date() } },
    { upsert: true }
  );
  revalidatePath('/watchlist'); // or revalidateTag('watchlist')
}
export async function removeFromWatchlist(symbol: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('Unauthorized');
  await connectToDatabase();
  await Watchlist.deleteOne({ userId: session.user.id, symbol: symbol.toUpperCase() });
  revalidatePath('/watchlist');
}
```
Wire `WatchlistButton` to call these instead of local state (optimistic update: flip UI immediately, roll back on server error). Build `/watchlist` page: server component reads `Watchlist.find({userId})`, joins live quote/price per symbol (Finnhub `/quote`), renders the already-defined `WATCHLIST_TABLE_HEADER` columns (Company, Symbol, Price, Change, Market Cap, P/E Ratio, Alert, Action).

For **alerts**, you need a new model — none exists:
```ts
// database/models/alert.model.ts
{
  userId: string,
  symbol: string,
  company: string,
  alertType: 'upper' | 'lower' | 'volume',
  threshold: number,        // price or volume threshold
  active: boolean,
  lastTriggeredAt: Date | null,
  cooldownMinutes: number,  // avoid spamming on every tick
  createdAt: Date,
}
```
See §5 for the trigger job — the alert model and the alert-checking job are two halves of the same feature.

---

## 5. Set price/volume triggers → instant email alerts — ❌ NOT BUILT (templates exist, nothing calls them)

`lib/nodemailer/templates.ts` has 3 fully-built HTML email templates that are **never sent by any code path**:
- `STOCK_ALERT_UPPER_EMAIL_TEMPLATE` — placeholders `{{symbol}} {{company}} {{currentPrice}} {{targetPrice}} {{timestamp}}`
- `STOCK_ALERT_LOWER_EMAIL_TEMPLATE` — same placeholders
- `VOLUME_ALERT_EMAIL_TEMPLATE` — volume-spike variant

There is **no sender function** for these in `lib/nodemailer/index.ts` (only `sendWelcomeEmail` and `sendNewsSummaryEmail` exist), **no Alert model**, **no scheduled job**, and **no UI** to create a threshold. `ALERT_TYPE_OPTIONS` / `CONDITION_OPTIONS` in `lib/constants.ts` are select-dropdown option lists with nothing behind them.

**To replicate, using this repo's existing stack (Inngest + Nodemailer + Finnhub) — this is the actual recipe the codebase points at but never finishes:**

1. **Model** — the `Alert` schema in §4 above.
2. **Alert-creation UI/action** — a form (reuse `InputField`/`SelectField` patterns) → server action `createAlert({symbol, alertType, threshold})` that inserts into `Alert`.
3. **Sender functions** in `lib/nodemailer/index.ts`, mirroring the existing two:
   ```ts
   export async function sendPriceAlertEmail({ email, symbol, company, currentPrice, targetPrice, isUpper }: ...) {
     const template = isUpper ? STOCK_ALERT_UPPER_EMAIL_TEMPLATE : STOCK_ALERT_LOWER_EMAIL_TEMPLATE;
     const html = template
       .replace('{{symbol}}', symbol).replace('{{company}}', company)
       .replace('{{currentPrice}}', String(currentPrice)).replace('{{targetPrice}}', String(targetPrice))
       .replace('{{timestamp}}', new Date().toISOString());
     await transporter.sendMail({ from: '"Signalist Alerts" <...>', to: email, subject: `${symbol} price alert`, html });
   }
   ```
   (Fix the naive `String.replace` — use a `replaceAll` or a real template engine so repeated placeholders don't silently fail.)
4. **Trigger job** — new Inngest function, cron every 1–5 min during market hours:
   ```ts
   export const checkPriceAlerts = inngest.createFunction(
     { id: 'check-price-alerts' },
     { cron: '*/5 13-21 * * 1-5' }, // UTC market hours, weekdays — adjust
     async ({ step }) => {
       const alerts = await step.run('get-active-alerts', () => Alert.find({ active: true }));
       const bySymbol = groupBy(alerts, 'symbol');
       const quotes = await step.run('fetch-quotes', async () =>
         Object.fromEntries(await Promise.all(Object.keys(bySymbol).map(async s =>
           [s, await fetchJSON(`${FINNHUB_BASE_URL}/quote?symbol=${s}&token=${token}`)]
         )))
       );
       for (const [symbol, symbolAlerts] of Object.entries(bySymbol)) {
         const quote = quotes[symbol]; // { c: currentPrice, v: volume, ... }
         for (const alert of symbolAlerts) {
           const triggered =
             (alert.alertType === 'upper' && quote.c >= alert.threshold) ||
             (alert.alertType === 'lower' && quote.c <= alert.threshold) ||
             (alert.alertType === 'volume' && quote.v >= alert.threshold);
           const onCooldown = alert.lastTriggeredAt &&
             Date.now() - alert.lastTriggeredAt.getTime() < alert.cooldownMinutes * 60_000;
           if (triggered && !onCooldown) {
             await step.sendEvent('emit-alert-triggered', {
               name: 'alerts/triggered', data: { alertId: alert._id, symbol, price: quote.c }
             });
           }
         }
       }
     }
   );
   ```
5. **Second Inngest function** listening on `alerts/triggered` does `step.run` to look up the user's email, call the sender from step 3, and update `lastTriggeredAt` — kept separate so a batch of triggers fans out via Inngest's own concurrency rather than one giant serial loop (the mistake the existing `sendDailyNewsSummary` makes — see §6).
6. **"Instant"** here really means "checked every N minutes" — true instant requires the live WebSocket from §1 evaluating thresholds in the same process that receives ticks, which trades simplicity for lower latency. Start with the cron approach; only build the streaming evaluator if 1–5 min latency isn't good enough.

---

## 6. Daily summaries with personalized stocks — ✅ BUILT (the best-implemented feature)

`lib/inngest/functions.ts` → `sendDailyNewsSummary`, id `daily-news-summary`, dual-triggered by event `app/send.daily.news` **and** cron `0 12 * * *` (noon UTC daily). Steps:

1. `step.run('get-all-users', getAllUsersForNewsEmail)` — `lib/actions/user.actions.ts` does a raw MongoDB driver query `db.collection('user').find()` (bypassing Mongoose) returning `{id, email, name}[]`.
2. `step.run('fetch-user-news', ...)` — **sequential** loop over every user: `getWatchlistSymbolsByEmail(user.email)` → `getNews(symbols)` (per-symbol Finnhub `company-news`, round-robin merged, capped at 6, sorted by `datetime` desc) → if empty, fall back to `getNews()` (general market news, deduped, capped at 6).
3. Outside a `step.run` (a real bug — loses per-item retry/idempotency): for each user, `step.ai.infer('summarize-news-<email>', gemini('gemini-2.5-flash-lite'), NEWS_SUMMARY_EMAIL_PROMPT)` with that user's article JSON embedded in the prompt, producing sectioned HTML.
4. `step.run('send-news-emails', ...)` — `Promise.all` over `sendNewsSummaryEmail({email, date, newsContent})`, which fills `NEWS_SUMMARY_EMAIL_TEMPLATE` (`lib/nodemailer/templates.ts`) via `String.replace` and sends through the Gmail SMTP transporter.

**Personalization is entirely watchlist-driven** — the digest for user A differs from user B only in which symbols' news gets pulled (§4 means this personalization loop is currently fed by an empty/stub watchlist in practice, since nothing writes to it yet).

**To replicate:** this event+cron dual-trigger pattern on one Inngest function is genuinely good — the same function that runs on a schedule can also be fired on-demand (e.g. a "resend my digest" button just does `inngest.send('app/send.daily.news')`). The one thing to fix, not copy: do the per-user Finnhub+Gemini work as **one Inngest function invoked per user via `step.sendEvent` fan-out**, not a serial loop inside a single run — at scale this will hit Finnhub rate limits and the function's execution-time cap.

---

## 7. Company insights — financials, analyst ratings, news sentiment — ❌ NOT BUILT (embed only, no ratings/sentiment at all)

`app/(root)/stocks/[symbol]/page.tsx` renders `COMPANY_PROFILE_WIDGET_CONFIG(symbol)` and `COMPANY_FINANCIALS_WIDGET_CONFIG(symbol)` through the same TradingView embed mechanism as §1/§2 (`company-profile` and `financials` widget scripts). That's it — whatever financial statements/ratios you see are rendered entirely inside TradingView's iframe-like widget; the app fetches none of it and stores none of it.

There is **no analyst-ratings data anywhere** (Finnhub has `/stock/recommendation` for this — unused) and **no sentiment pipeline** (Finnhub has `/news-sentiment` — unused). The page is "fully static per symbol" per its own analysis: `company` is literally the raw ticker string, not a real company name.

**To replicate real company insights server-side**, Finnhub (already your API key/integration) gives you most of this on the free/basic tier:
- `/stock/profile2?symbol=` — name, logo, industry, market cap, IPO date (currently only used for the search-palette seed list, never on the detail page).
- `/stock/metric?symbol=&metric=all` — PE ratio, EPS, 52-week high/low, margins, growth rates.
- `/stock/recommendation?symbol=` — analyst buy/hold/sell counts by month (this is your "analyst ratings").
- `/news-sentiment?symbol=` — Finnhub's own bullish/bearish sentiment score + buzz metrics (this is your "sentiment" feature, no need to build a scoring pipeline yourself).
- `/stock/earnings?symbol=` — EPS actual vs. estimate history.

Build pattern (matches `finnhub.actions.ts` conventions already in the repo):
```ts
export const getCompanyInsights = cache(async (symbol: string) => {
  const [profile, metrics, recommendations, sentiment] = await Promise.all([
    fetchJSON(`${FINNHUB_BASE_URL}/stock/profile2?symbol=${symbol}&token=${token}`, 3600),
    fetchJSON(`${FINNHUB_BASE_URL}/stock/metric?symbol=${symbol}&metric=all&token=${token}`, 3600),
    fetchJSON(`${FINNHUB_BASE_URL}/stock/recommendation?symbol=${symbol}&token=${token}`, 3600),
    fetchJSON(`${FINNHUB_BASE_URL}/news-sentiment?symbol=${symbol}&token=${token}`, 300),
  ]);
  return { profile, metrics, recommendations, sentiment };
});
```
Call this from `app/(root)/stocks/[symbol]/page.tsx` (make it actually fetch server-side, which it currently doesn't) and render your own cards/charts instead of — or alongside — the TradingView `company-profile`/`financials` embeds. This directly fixes the "hard-coded `company = symbol`" bug noted in the existing analysis, since `profile.name` gives you the real company name for free.

---

## Cross-cutting notes for your rebuild

- **Every implemented feature here is a Server Action or Server Component** — no REST/GraphQL API layer except `/api/inngest`. This is a legitimate, low-boilerplate pattern for Next.js 15 + App Router; keep it unless you need a public API for third parties.
- **Caching pattern worth copying**: `fetchJSON(url, revalidateSeconds?)` toggles `{cache:'force-cache', next:{revalidate}}` vs `{cache:'no-store'}` — one helper, per-call TTL. Use short TTLs (300s) for anything news/price-adjacent, long TTLs (3600s) for slow-changing profile/fundamentals data.
- **Auth gate pattern worth copying**: route-group `layout.tsx` files calling `auth.api.getSession()` and `redirect()` — simpler to reason about than middleware, though a real `middleware.ts` cookie-presence check first is a cheap latency win this repo fails to actually wire up (`middleware/index.ts` here sits in the wrong path and never runs).
- **Inngest is the right tool** for both the alert-checker cron (§5) and the daily digest (§6) — one place for scheduled + event-driven jobs, plus `step.ai.infer` gives you Gemini calls without a separate AI SDK.
- If you want the live-streaming (§1) and instant alerts (§5) to actually share infrastructure: run one server-side WebSocket-to-Finnhub connection, fan out ticks over SSE to browser tabs for the live dashboard, and evaluate active alert thresholds against the same tick stream instead of a separate polling cron — lower latency, one Finnhub connection instead of N.
