import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Step = { label: string; result: unknown };

export default async function DebugPage() {
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();
  const steps: Step[] = [];

  const read1 = await supabase.from("watchlist_items").select("*");
  steps.push({
    label: "1. select my watchlist_items (expect [])",
    result: read1.error ?? read1.data,
  });

  const insert = await supabase
    .from("watchlist_items")
    .insert({ symbol: "TEST", thesis: "phase1 sanity" })
    .select()
    .single();
  steps.push({
    label: "2. insert TEST row (user_id auto-filled by column default)",
    result: insert.error ?? insert.data,
  });

  const read2 = await supabase
    .from("watchlist_items")
    .select("*")
    .eq("symbol", "TEST");
  steps.push({ label: "3. read back the TEST row", result: read2.error ?? read2.data });

  const del = await supabase
    .from("watchlist_items")
    .delete()
    .eq("symbol", "TEST")
    .select();
  steps.push({ label: "4. delete the TEST row", result: del.error ?? del.data });

  const read3 = await supabase.from("watchlist_items").select("*");
  steps.push({
    label: "5. select again (expect [] — round-trip clean)",
    result: read3.error ?? read3.data,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Debug — auth + RLS + DB round-trip</h1>
      <p className="text-sm text-gray-600">
        Clerk user id: <code className="rounded bg-gray-100 px-1">{userId}</code>
      </p>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="rounded border border-gray-200 p-3">
            <div className="font-medium">{s.label}</div>
            <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2 text-xs">
              {JSON.stringify(s.result, null, 2)}
            </pre>
          </li>
        ))}
      </ol>
      <p className="text-xs text-gray-500">
        Temporary sanity-check page — removed in a later phase.
      </p>
    </div>
  );
}
