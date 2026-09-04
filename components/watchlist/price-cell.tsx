/**
 * Renders a watchlist row's price. Server component, no client JS.
 *
 *   - price + prevClose present -> "₹1,250.40" and a coloured "+1.24%"
 *   - price present, no usable prevClose -> just the price
 *   - no price -> muted "Fetching price…" (symbol added but the job hasn't run)
 *
 * Staleness is intentionally NOT shown here — that badge is Phase 8.
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
}: {
  price: number | null | undefined;
  prevClose: number | null | undefined;
}) {
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return (
      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
        Fetching price…
      </span>
    );
  }

  const pct = percentChange(price, prevClose);
  const pctColor =
    pct === null
      ? "text-gray-400"
      : pct > 0
        ? "text-green-600"
        : pct < 0
          ? "text-red-600"
          : "text-gray-500";
  const pctLabel =
    pct === null
      ? null
      : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%`;

  return (
    <div className="text-right">
      <div className="font-medium tabular-nums">{inr.format(price)}</div>
      {pctLabel && (
        <div className={`text-xs tabular-nums ${pctColor}`}>{pctLabel}</div>
      )}
    </div>
  );
}
