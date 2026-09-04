import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";

/**
 * Inngest's HTTP entrypoint. The dev server and Inngest Cloud call this route
 * server-to-server to sync the function list and invoke runs — it is NOT
 * Clerk-protected (see middleware.ts: /api/inngest is not in the protected
 * matcher). Functions are added to the array in later tasks.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [],
});
