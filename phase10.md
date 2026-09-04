CONTEXT
Continuing the smart market watchlist project (Next.js 15 App Router,
TypeScript, Tailwind, Clerk, Supabase, Inngest, Gemini, Resend). Phases
1-9 are complete and were each built with a real design spec, an
implementation plan, and a code-review pass, tracked in `context.md` and
`phase1.md`-`phase9.md`. Somewhere after Phase 9 was declared done, a
single large commit (`ddb65f7`, "Preview-1") landed a full visual
redesign PLUS three genuinely new features — price/volume email alerts
(`lib/alerts/`, `lib/inngest/functions/alert-check.ts`,
`lib/email/`), a company-insights page (`app/(protected)/stocks/[symbol]/`,
`lib/stocks/insights.ts`), and real candlestick charts
(`components/charts/candlestick-chart.tsx`) — none of which went through
that same discipline. `.env.example` even labels the alerts section
"Phase 10", but no `phase10.md` brief, design spec, plan, or code review
was ever written for it, and `context.md` was never updated past Phase 9.

This phase closes that gap and fixes everything else found in a full
external audit run against the actual code (not the docs' claims about
it) immediately before this brief was written. The audit's full findings
are summarized in the tasks below — each task names the exact file(s)
and the exact problem, so this can be executed without re-deriving the
audit from scratch. We are in the final stage before submission: the
goal is a demo-ready, judge-defensible, consistently-documented product,
not new scope.

GOAL FOR THIS PHASE
Every feature that already exists and works (alerts, company insights,
candlestick charts, the redesign) gets the same level of documentation,
review, and verification as Phases 1-9 — so nothing in this codebase is
a surprise if a judge opens the file that backs it. The one real,
concretely-diagnosed performance bug (the animated background) is fixed
without losing the premium visual feel. Every claim your pitch materials
make is either backed by real evidence or explicitly softened to match
what's actually been measured. Nothing new is added beyond what's
described here.

TASKS

1. Retroactively document and review the Phase 10 feature set
   - Write a short design/plan doc for what `ddb65f7` actually shipped —
     alerts (schema `alerts` table + RLS in
     `supabase/migrations/0006_alerts.sql`, `createAlert`/`removeAlert`/
     `toggleAlert` in `app/(protected)/watchlist/alert-actions.ts`, the
     evaluation cron in `lib/inngest/functions/alert-check.ts`, email
     delivery via `lib/email/`), company insights (`lib/stocks/insights.ts`,
     `app/(protected)/stocks/[symbol]/page.tsx` and its
     `components/stocks/*` children), and candlestick charts
     (`components/charts/candlestick-chart.tsx`,
     `app/api/stocks/[symbol]/candles/route.ts`). Doesn't need to be exhaustive like Phase 5-8's specs — a "what it does, what it
     decided, what it trades off" writeup matching this project's own
     established format is enough. Save as
     `docs/superpowers/specs/2026-09-05-phase10-alerts-insights-design.md`
     (match the existing naming convention in that directory).
   - Run one real code-review pass against this feature set specifically
     — the kind every other phase got. At minimum, deliberately check:
     (a) the alert cooldown logic in `alert-check.ts`'s `onCooldown()` for
     off-by-one/timezone issues, (b) whether `createAlert`'s
     `MIN_COOLDOWN_MINUTES * 4` default (60 min) is actually enforced as a
     *minimum* anywhere, or whether nothing stops a future caller from
     passing a shorter cooldown once the UI grows a custom-cooldown
     control, (c) whether `getCompanyInsights`'s `cache()` wrapper could
     ever serve stale insights across users (it shouldn't, since it's
     server-only, but verify — it's not RLS-scoped like the Supabase
     calls elsewhere, it's Finnhub data, so confirm that's actually fine),
     (d) the `resolveEmail()` fallback in `alert-check.ts` (falls back to
     `user.emailAddresses[0]` if no primary is set — confirm this can't
     silently email the wrong address for a multi-email Clerk account).
     Fix anything Important/Critical found; document anything Minor,
     same "fixed vs. documented, never hidden" standard every earlier
     phase used.
   - Add a `scripts/verify-alerts.ts` (`npm run verify:alerts`) covering
     the pure logic in `alert-check.ts` — `isTriggered()`'s three alert
     types and `onCooldown()`'s boundary condition — mirroring the style
     of the existing four `verify:*` scripts (pure functions, no I/O,
     `tsx`-run, explicit pass/fail count printed).
   - Update `context.md` with a real "Phase 10" section in the same
     format as every phase before it (what's built, table of files,
     deviations, verification status) so the project's own build history
     stops going silent after Phase 9.

2. Fix the animated-background performance issue
   - `components/ui/backdrop.tsx` renders `DotPattern` with `glow: true`
     ([components/magicui/dot-pattern.tsx]) across the full viewport at
     24px spacing — roughly 3,000-4,000 individually Framer-Motion-
     animated `<motion.circle>` elements, each running an infinite
     opacity/scale loop, permanently, on every single page (it's mounted
     once in `app/layout.tsx`, so it's present on the landing page,
     sign-in, dashboard, watchlist — everywhere). This is a real,
     continuous CPU/GPU cost competing with everything else on the page,
     and a plausible cause of visible stutter during a live demo.
   - Fix without losing the premium ambient-glow look: render the static
     dot grid as a single tiled SVG `<pattern>` fill (one element,
     GPU-composited normally) instead of one node per dot, then animate
     only a small fixed subset (roughly 15-25 dots at random positions)
     via CSS `@keyframes` opacity/scale instead of per-dot Framer Motion,
     to keep the "twinkling" effect at a fixed, small, continuous cost
     instead of one that scales with viewport size.
   - While in this file, also sanity-check the two `blur-[140px]`
   `animate-float` blobs in the same component — confirm they're pure
     CSS (they already should be) and consider trimming blur radius
     slightly (e.g. to 100px) if the dot-grid fix alone doesn't resolve
     visible jank on a mid-range laptop.
   - Secondary, lower-priority fix in the same problem area: each mounted
     `CandlestickChart` instance (`components/charts/candlestick-chart.tsx`)
     adds its own `window.resize` listener with no debounce; if a demo
     opens multiple chart toggles at once, resizing the window does
     unthrottled work per chart. Add a simple debounce (~100ms) around
     the resize handler.

3. Fix the stale middleware route matcher
   - `middleware.ts`'s `isProtectedRoute` matcher only lists
     `/dashboard(.*)` and `/watchlist(.*)` — it was never updated when
     `/stocks/[symbol]` was added. This is not currently a security hole
     (`app/(protected)/layout.tsx`'s `auth.protect()` still gates
     everything under the `(protected)` route group as the real
     defense-in-depth layer), but it means middleware is silently doing
     nothing for that route, which is exactly the kind of inconsistency
     a code-reading judge would flag. Add `/stocks(.*)` to the matcher so
     the "defense in depth" comment in `(protected)/layout.tsx` is
     actually true for every protected route, not just two of three.

4. Bring the pitch materials up to date with what's actually built
   - `README.md`'s Routes table is missing `/stocks/[symbol]` and doesn't
     mention alerts at all. Add both. Add a short "Key decisions" entry
     (matching the existing format) for whichever of alerts/insights you
     want to be able to speak to confidently — at minimum, name that
     alerts are real (threshold + cooldown + email, not just a UI stub)
     since that's a feature the reference analysis in `base_guide.md`
     explicitly flagged as commonly left unbuilt in projects like this.
   - `README.md`'s "Key decisions" section currently has no answer for
     "how does state persist across sessions/devices" even though the
     real answer is good (everything lives in Supabase keyed by Clerk
     `user_id`, RLS-enforced, zero `localStorage`/`sessionStorage`
     anywhere in the client code — confirmed by grep). Add this as an
     explicit decision with that one-sentence proof point, so it's a
     rehearsed answer instead of an improvised one if asked.
   - `DEMO_SCRIPT.md` never mentions alerts or the company-insights page.
     Decide deliberately, don't leave it as an accident: either (a) add a
     short beat for one or both (a real differentiator that's currently
     invisible to judges who only watch the scripted flow), or (b)
     explicitly scope them out and add one line to the "likely hard
     questions" section for "what's this alerts panel / stock detail
     page I'm seeing" so it's not a surprise mid-demo. Given both are
     real, working, and relevant to "Product & Problem Interpretation"
     judging (goes beyond price/%change), (a) is the stronger choice if
     time allows.

5. Add CI so "meaningful tests" is a real answer, not a claim - There is currently no `.github/workflows` directory — the four
     `verify:*` scripts, `typecheck`, and `build` only ever run when a
     human remembers to run them locally. Add a minimal GitHub Actions
     workflow (`.github/workflows/ci.yml`) that runs on every push/PR:
     `npm ci`, `npm run typecheck`, `npm run build`, and all five
     `verify:*` scripts (including the new `verify:alerts` from task 1).
     This doesn't need to be elaborate — the point is that "we verify
     this automatically" becomes true rather than aspirational.

6. Get real numbers for the scaling answer instead of "not measured"
   - `context.md` (Phase 9) and `README.md`'s "Known limitations" both
     say the 30-50 stock performance test was never actually run — it's
     been an outstanding manual step since Phase 9. Before submission,
     actually build a test watchlist at that scale, load `/dashboard`,
     and record: total load time, whether `GET /api/watchlist/diffs`
     shows as one request in the Network tab (code-level batching is
     already confirmed correct — this is about confirming it holds under
     real data volume, not re-checking the code), and whether the 5-min
     snapshot cron keeps up without hitting Finnhub's free-tier rate
     limit. Replace the vague "not measured" language in README's Known
     Limitations with the real numbers, good or bad — if it's slow at
     that scale, that's a legitimate "next steps" talking point, not
     something to hide.

WHAT NOT TO DO IN THIS PHASE
- No new features. Alerts, company insights, and candlestick charts
  already exist and work — this phase documents, reviews, and verifies
  them, it does not extend them (no new alert types, no new insight
  metrics, no chart indicators).
- Don't touch the meaningfulness scoring weights/thresholds, the
  reconciliation tie-break policy, or the thesis-relevance prompt — those
  were already deliberately tuned and documented in earlier phases.
- Don't add a second email provider alongside Resend — Resend is already
  correctly integrated with graceful degradation; adding another one
  would be redundant risk this close to submission, not an improvement.
- Don't restructure the glassmorphism/dark visual design — task 2 is
  specifically about fixing the animation *performance* cost while
  preserving the current look, not redesigning it.

---

MANUAL STEPS (must be done by you, not the AI/code)

1. Confirm a real `RESEND_API_KEY` is set in `.env.local` (and in
   production, if deployed) before demo day — alerts currently degrade
   silently to "logged but not emailed" without it, which is correct
   behavior but means you want to have actually tested a real email
   arriving at least once before presenting.
2. Decide, for task 4's `DEMO_SCRIPT.md` question, whether alerts and/or
   company insights become part of the live demo path or stay
"ask me about it" material — this is a judgment call about your
   demo's time budget, not something to leave to the AI.
3. After task 2's background fix, actually look at it running for 30+
   seconds on the machine you'll demo from and judge whether it still
   feels premium and whether the stutter is genuinely gone — this is a
   visual/feel judgment call, not something `tsc`/`build` can verify.
4. Run task 6's 30-50 stock performance test yourself against a real
   Supabase project and Finnhub key — needs a live account, can't be
   done headlessly.
5. Re-rehearse the demo script once more after task 4's edits land, in
   case the new alerts/insights beat changes your timing.

---

TESTING — DO NOT MARK THIS PHASE DONE UNTIL ALL OF THESE PASS
1. `npm run typecheck`, `npm run build`, and all five `verify:*` scripts
   (including the new `verify:alerts`) pass clean.
2. The new CI workflow (task 5) actually runs and goes green on a real
   push — don't just write the YAML, confirm it executes.
3. Every page in the app (landing, sign-in, dashboard, watchlist, a
   stock detail page) loads and scrolls without visible animation
   stutter on the machine you'll actually demo from.
4. `middleware.ts`'s matcher includes `/stocks(.*)`; confirm
   unauthenticated access to `/stocks/AAPL` still redirects to sign-in
   exactly like `/dashboard` and `/watchlist` do.
5. `README.md`'s Routes table and Key Decisions section, and
   `DEMO_SCRIPT.md`, both accurately reflect every real feature in the
   app — read them fresh as if you're a judge who has only the docs, not
   the code, and confirm nothing you'd actually demo is a surprise.
6. `context.md` has a real Phase 10 section, matching the format of
   Phases 1-9, so the project's documented history is continuous through
   to the current state.
7. The 30-50 stock performance test from task 6 completed with real
   numbers recorded in README's Known Limitations, replacing the current
   "not measured" language.

Report back: final state of the project, any known remaining issues (and
whether they're acceptable to ship with or need a quick fix), and
whether the demo script — including whatever you decided about alerts
and company insights — feels ready.