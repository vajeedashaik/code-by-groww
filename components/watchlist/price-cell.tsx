import StalenessBadge from "@/components/watchlist/staleness-badge";

/**
 * Renders a watchlist row's price. Server component, no client JS.
 *
 *   - price + prevClose present -> "₹1,250.40" and a coloured "+1.24%"
 *   - price present, no usable prevClose -> just the price
 *   - no price -> muted "Fetching price…" (symbol added but the job hasn't run)
 *
 * Phase 8: also renders the staleness badge for `fetchedAt` next to the
 * price — neutral for FRESH/DELAYED, a calm warm tone for STALE.
 */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function percentChange(
  price: number,
  prevClose: number | null | undefined,
): number | null {
  if (typeof prevClose !== "number" || !Number.isFinite(prevClose) || prevClose === 0) {
    return null;
  }
  return ((price - prevClose) / prevClose) * 100;
}

export default function PriceCell({
  price,
  prevClose,
  fetchedAt,
}: {
  price: number | null | undefined;
  prevClose: number | null | undefined;
  fetchedAt?: string | null;
}) {
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return (
      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/45">
        Fetching price…
      </span>
    );
  }

  const pct = percentChange(price, prevClose);
  const pctColor =
    pct === null ? "text-white/35" : pct > 0 ? "text-up text-glow-up" : pct < 0 ? "text-down text-glow-down" : "text-white/50";
  const pctLabel =
    pct === null
      ? null
      : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%`;

  return (
    <div className="text-right">
      <div className="font-display font-medium tabular-nums text-white">{inr.format(price)}</div>
      {pctLabel && (
        <div className={`text-xs tabular-nums ${pctColor}`}>{pctLabel}</div>
      )}
      <div className="mt-1">
        <StalenessBadge fetchedAt={fetchedAt} />
      </div>
    </div>
  );
}
