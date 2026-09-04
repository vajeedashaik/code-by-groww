import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { snapshotIngest } from "@/lib/inngest/functions/snapshot-ingest";
import { dailyHistoryBackfill } from "@/lib/inngest/functions/daily-history-backfill";

/**
 * Inngest's HTTP entrypoint. The dev server (`npm run inngest`) and Inngest
 * Cloud call this route server-to-server to sync functions and invoke runs.
 * It is NOT Clerk-protected — see middleware.ts (not in the protected
 * matcher).
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [snapshotIngest, dailyHistoryBackfill],
});
