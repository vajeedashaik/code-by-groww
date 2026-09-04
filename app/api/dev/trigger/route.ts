import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { inngest } from "@/lib/inngest/client";

/**
 * Dev-only manual trigger so you don't have to wait for the 5-minute cron while
 * testing. 404s in production. Auth-gated (Clerk) so a stray request can't
 * spend our data-source quota.
 *
 *   GET/POST /api/dev/trigger?job=snapshot   -> fires market/snapshot.requested
 *   GET/POST /api/dev/trigger?job=history    -> fires market/history.requested
 *
 * The Inngest dev dashboard's "Invoke" button is the other way to do this.
 *
 * GET is intentionally state-changing here for curl convenience — dev-only
 * route, 404'd in production, narrow blast radius (own Finnhub/data-source
 * quota).
 */

const EVENTS = {
  snapshot: "market/snapshot.requested",
  history: "market/history.requested",
} as const;

async function handle(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobParam = new URL(request.url).searchParams.get("job") ?? "snapshot";
  if (jobParam !== "snapshot" && jobParam !== "history") {
    return NextResponse.json(
      { error: "job must be 'snapshot' or 'history'" },
      { status: 400 },
    );
  }

  try {
    const { ids } = await inngest.send({ name: EVENTS[jobParam] });
    return NextResponse.json({ sent: true, job: jobParam, ids });
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach Inngest — is the dev server running?" },
      { status: 502 },
    );
  }
}

export const GET = handle;
export const POST = handle;
