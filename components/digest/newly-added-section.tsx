import type { BucketedItem } from "@/lib/digest/summarize";

/** Lightweight list of first-view symbols — nothing to score yet (phase6.md task 1). */
export default function NewlyAddedSection({ items }: { items: BucketedItem[] }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        Newly added ({items.length})
      </h2>
      <ul className="space-y-1">
        {items.map(({ item }) => (
          <li key={item.symbol} className="flex items-baseline gap-2 text-sm">
            <span className="font-medium">{item.symbol}</span>
            {item.companyName && <span className="text-gray-500">{item.companyName}</span>}
            <span className="text-xs text-gray-400">First time viewing</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
