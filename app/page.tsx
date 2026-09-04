import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { BlurFade } from "@/components/magicui/blur-fade";
import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text";
import { ShimmerButton } from "@/components/magicui/shimmer-button";
import { BorderBeam } from "@/components/magicui/border-beam";
import { MagicCard } from "@/components/magicui/magic-card";
import { Marquee } from "@/components/magicui/marquee";
import Button from "@/components/ui/button";

const TICKER = [
  { symbol: "RELIANCE", pct: "+1.24%", up: true },
  { symbol: "TCS", pct: "-0.62%", up: false },
  { symbol: "INFY", pct: "+2.05%", up: true },
  { symbol: "HDFCBANK", pct: "+0.31%", up: true },
  { symbol: "TATAMOTORS", pct: "-1.48%", up: false },
  { symbol: "ITC", pct: "+0.09%", up: true },
  { symbol: "SBIN", pct: "-0.77%", up: false },
  { symbol: "WIPRO", pct: "+1.91%", up: true },
];

const FEATURES = [
  {
    title: "Remembers, not just refreshes",
    body: "Every stock is diffed against the exact snapshot you last saw — not a fixed “since yesterday” window.",
    icon: "↻",
  },
  {
    title: "Attention, rationed on purpose",
    body: "Urgent, Notable, and Routine buckets — with the reasoning behind every call one click away, never hidden.",
    icon: "⚡",
  },
  {
    title: "Honest about data quality",
    body: "Stale prices and disagreeing sources are shown, not smoothed over — confidence drops when the data does.",
    icon: "◉",
  },
];

export default function Home() {
  return (
    <div className="space-y-24 pb-16">
      <section className="pt-8 text-center sm:pt-16">
        <BlurFade delay={0.05}>
          <Link
            href="#features"
            className="group glass mx-auto inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pulse shadow-[0_0_8px_#00d084]" />
            <AnimatedShinyText>AI-verified thesis checks, built for signal over noise</AnimatedShinyText>
          </Link>
        </BlurFade>

        <BlurFade delay={0.15}>
          <h1 className="font-display mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Stop re-reading the <span className="text-pulse">same tickers.</span>
          </h1>
        </BlurFade>

        <BlurFade delay={0.25}>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/70">
            Groww Pulse remembers exactly what you saw last, and only surfaces a stock again when the move is
            genuinely meaningful — not just loud.
          </p>
        </BlurFade>

        <BlurFade delay={0.32}>
          <p className="mx-auto mt-4 max-w-xl text-sm text-white/45">
            Every change is scored against the stock&apos;s own normal volatility and the broader market/sector, so a
            routine 3% wobble on a choppy stock never crowds out a quiet 1% move on a calm one that actually
            matters. Flag a stock with your own thesis, and an AI check reads the news to tell you if it still
            holds.
          </p>
        </BlurFade>

        <BlurFade delay={0.4}>
          <div className="mt-8 flex items-center justify-center gap-3">
            <SignedIn>
              <Link href="/dashboard">
                <ShimmerButton>Go to your digest</ShimmerButton>
              </Link>
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <span>
                  <ShimmerButton>Sign in to get started</ShimmerButton>
                </span>
              </SignInButton>
            </SignedOut>
            <Link href="#features">
              <Button variant="ghost" size="md">
                See how it works
              </Button>
            </Link>
          </div>
        </BlurFade>
      </section>

      <BlurFade delay={0.5}>
        <div className="glass relative overflow-hidden rounded-3xl py-4">
          <Marquee pauseOnHover className="[--duration:28s]">
            {TICKER.map((t) => (
              <span key={t.symbol} className="flex items-center gap-2 px-4 text-sm">
                <span className="font-medium text-white/80">{t.symbol}</span>
                <span className={t.up ? "text-up" : "text-down"}>{t.pct}</span>
              </span>
            ))}
          </Marquee>
          <div className="from-ink pointer-events-none absolute inset-y-0 left-0 w-24 bg-linear-to-r to-transparent" />
          <div className="from-ink pointer-events-none absolute inset-y-0 right-0 w-24 bg-linear-to-l to-transparent" />
        </div>
      </BlurFade>

      <section id="features" className="grid gap-5 sm:grid-cols-3">
        {FEATURES.map((f, i) => (
          <BlurFade key={f.title} delay={0.15 * i} inView>
            <MagicCard className="relative h-full rounded-3xl p-6">
              <BorderBeam duration={8} delay={i * 2} size={80} />
              <span className="clay flex h-10 w-10 items-center justify-center rounded-2xl text-lg text-pulse">
                {f.icon}
              </span>
              <p className="mt-4 text-sm font-semibold text-white">{f.title}</p>
              <p className="mt-2 text-sm text-white/55">{f.body}</p>
            </MagicCard>
          </BlurFade>
        ))}
      </section>
    </div>
  );
}
