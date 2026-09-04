import type { CompanyProfile } from "@/lib/stocks/insights";
import GlassCard from "@/components/ui/glass-card";

function fmtMarketCap(value: number | null): string {
  // Finnhub reports marketCapitalization in millions of the listing currency.
  if (value === null) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}T`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}B`;
  return `$${value.toFixed(0)}M`;
}

export default function CompanyHeader({ profile, symbol }: { profile: CompanyProfile | null; symbol: string }) {
  if (!profile) return null;

  return (
    <GlassCard className="flex flex-wrap items-center gap-4 p-5">
      {profile.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- external, unknown-dimension Finnhub logo URL
        <img src={profile.logo} alt="" className="h-12 w-12 rounded-2xl bg-white/5 object-contain p-1.5" />
      ) : (
        <div className="clay flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-semibold text-pulse">
          {symbol.slice(0, 2)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-display font-semibold text-white">{profile.name}</p>
        <p className="text-sm text-white/40">
          {profile.exchange && `${profile.exchange} · `}
          {profile.industry ?? "—"}
        </p>
      </div>
      <div className="text-right text-sm">
        <p className="text-white/40">Market cap</p>
        <p className="font-display font-semibold text-white">{fmtMarketCap(profile.marketCapitalization)}</p>
      </div>
    </GlassCard>
  );
}
