# Manual setup — do these yourself before demo

Code checked, not runtime. These are things only you can do (dashboard clicks, keys, rehearsal).

**Update:** full browser test pass done (chrome-devtools MCP, sign-up → watchlist → dashboard →
Time Machine → thesis AI check → prod build → signed-out redirects). One code bug found and
fixed: `lib/inngest/functions/thesis-relevance.ts` was pinned to `gemini-2.5-flash`, which Google
deprecated — every thesis check was silently retrying for minutes before falling back to
"unavailable". Changed to `gemini-flash-latest`, verified working end-to-end. This was a **real
bug in the one AI feature of the product** — good thing to mention if asked "what did you fix
last."

## 1. Gemini key already added
`.env.local` now has `GEMINI_API_KEY` filled in and confirmed working (verdict came back correctly
in ~5s during testing). Nothing to do here unless you rotate the key.

## 2. Verify existing keys still valid
`.env.local` already has Clerk/Supabase/Finnhub keys filled — but check they're not expired/rate-limited right before demo:
- Clerk: https://dashboard.clerk.com → app → API Keys, confirm keys match
- Supabase: https://supabase.com/dashboard → project `ngzxcsvemaqnafvbowsk` → Project Settings → API, confirm URL/anon/service_role match
- Finnhub: https://finnhub.io dashboard, confirm key active + check free-tier rate limit not exhausted

## 3. Run Supabase migrations
Migration `0005_market_snapshot_conflict.sql` is new/untracked — confirm it's actually applied to your Supabase project.
- Supabase dashboard → SQL Editor → run `supabase/migrations/0001` through `0005` in order (or run `supabase/schema.sql` once, same result)
- Skip any migration you're sure already ran — check by inspecting the relevant table/column exists

## 4. Wire Clerk ↔ Supabase (one-time, dashboard only)
- Supabase dashboard → Authentication → Sign In / Providers → Third Party Auth → Add provider → Clerk
- Follow "Connect with Supabase" flow inside Clerk dashboard, paste the Clerk domain back into Supabase
- Without this, auth'd Supabase calls fail even with correct keys

## 5. Install + run (two terminals)
```bash
npm install
npm run dev        # terminal 1 — app on :3000
npm run inngest     # terminal 2 — Inngest dev server + dashboard on :8288
```

## 6. Seed demo data
- Open http://localhost:3000, sign up a test account
- Go to `/watchlist`, add your demo stocks (pick symbols you'll narrate in the demo)
- Prices/scores need a snapshot run — don't wait 5 min live:
  - visit `/api/dev/trigger?job=snapshot` while signed in, OR
  - open Inngest dashboard (localhost:8288) → find the snapshot function → **Invoke** button
- Trigger it 2-3 times a few minutes apart so there's diff history to score (need ≥2 snapshots for a meaningful digest)
- **Also trigger `/api/dev/trigger?job=history` once** (daily history backfill). Confirmed during
  testing: without this, Market Time Machine shows "No comparison data available" for
  market/sector and every score sits at Low confidence — the whole "z-score vs market vs sector"
  story the demo leans on doesn't show up until this has run at least once. It's a separate job
  from the 5-min snapshot cron and doesn't run automatically as often — do this before every demo
  session against a fresh DB.

## 7. Add a thesis to at least one stock
- On `/watchlist`, use edit-thesis control on one stock, write a real thesis sentence
- The AI check only fires for stocks that land in the **Urgent or Notable** bucket (Routine stocks
  never get a thesis check — confirmed in code and by testing). If your demo stocks stay calm
  (likely outside market hours), you won't see a verdict appear naturally. Either time the demo
  for a real volatile day, or don't rely on watching it happen live — screenshot one in advance.

## 8. Get a real "why flagged" example
- Check your demo stocks actually produced an Urgent or Notable card (not all Routine) — if not, add a more volatile stock or wait for a real move
- Note the actual numbers (z-score, volume multiplier) for your talking points — DEMO_SCRIPT.md section 4 wants real figures, not placeholders

## 9. Fill in DEMO_SCRIPT.md brackets
`DEMO_SCRIPT.md` has `[...]` placeholders (symbol names, %, thesis text) — replace with your real demo data before rehearsing.

## 10. Rehearse out loud, timed, 2x minimum
Read DEMO_SCRIPT.md's own note — reading silently hides awkward transitions. Actually say it out loud, ideally to another person, with a timer. Target ~4m15s total (see script's timing table).

## 11. Prep hard-question answers
DEMO_SCRIPT.md bottom section has 4 likely questions with answer sketches — read them over, don't improvise live.

## 12. Screenshot/record a clean run as fallback
Take screenshots or a short screen recording of a working end-to-end run NOW, in case live internet/Supabase/Inngest misbehaves during actual slot.

## 13. Cold-start sanity check
Close browser fully, clear session, reopen, sign in fresh, walk full demo path once — catches any state that only works because your dev session was already warm.

## 14. (Only if hackathon needs a live link, not local demo)
- Deploy to Vercel, set all env vars (Clerk/Supabase/Finnhub/Gemini) in Vercel project settings
- Register Inngest functions with Inngest Cloud (needs `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`) so snapshot cron runs in prod
- Re-run steps 6-8 against the deployed URL, not localhost — prod env can behave differently

## 15. Decide on Clerk bot-protection (Turnstile CAPTCHA)
You turned this OFF in Clerk dashboard (Configure → Attack protection → Bot sign-up protection)
during this test session, because it was blocking automated browser testing. Real human judges
signing up in a real browser will pass Turnstile fine even with it ON — this only mattered for
automation. Your call whether to re-enable it before submission; leaving it off is low-risk for a
demo, just means bot-signup protection is off on your dev Clerk instance.

## 16. Cosmetic: Clerk branding says "Groww Pulse"
The Clerk sign-in/sign-up modal header reads "Sign in to Groww Pulse" / "Groww Pulse" — doesn't
match the app's actual name "Smart Market Watchlist" shown everywhere else. Minor, but a sharp
judge might notice the mismatch. Fix in Clerk dashboard → Configure → Application → name field, if
you want it consistent.

## 17. Don't run `npm run dev` and `npm run build`/`npm start` at the same time
Confirmed during testing: running a dev server and a production build against the same `.next`
folder at the same time corrupts it (`next build` failed with "Cannot find module for page:
/api/search" and similar). Stop `npm run dev` before running `npm run build`. If you ever see that
error, `rm -rf .next` and rebuild clean with dev stopped.

## 18. Known non-blocking gap: Watchlist page doesn't show thesis verdict
By design, the AI thesis verdict (Mostly intact / Contradicted / Unclear / etc.) only renders on
the `/dashboard` digest's expandable Urgent/Notable card — not on the raw `/watchlist` table
(which only shows the thesis text itself). Confirmed in code, matches the documented "the receipt
is one click away, never hidden on the main card" design decision. Not a bug — just don't expect
to see a verdict while looking at `/watchlist`.
