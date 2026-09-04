import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { inngest } from "@/lib/inngest/client";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { sendAlertEmail } from "@/lib/email/send-alert-email";
import { isTriggered, onCooldown } from "@/lib/alerts/evaluate";
import type { AlertType } from "@/lib/alerts/types";

/**
 * Evaluates every active price/volume alert against the latest
 * market_snapshots row for its symbol, and emails the owner for anything
 * that crosses its threshold and isn't on cooldown. Runs on the same 5-min
 * cadence as snapshot-ingest (offset by design — Inngest's cron scheduler
 * doesn't guarantee run order between functions, so this always reads
 * whatever snapshot is newest *at evaluation time*, one cycle behind at
 * worst) rather than being chained onto it, so a slow/failed snapshot run
 * never blocks alert delivery for symbols that already have fresh data.
 */

export interface AlertRecord {
  id: string;
  user_id: string;
  symbol: string;
  company_name: string | null;
  alert_type: AlertType;
  threshold: number;
  last_triggered_at: string | null;
  cooldown_minutes: number;
}

export interface LatestReading {
  price: number;
  volume: number | null;
  fetched_at: string;
}

async function resolveEmail(userId: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
    return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
  } catch (err) {
    console.error(
      `[alert-check] couldn't resolve email for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export const alertCheck = inngest.createFunction(
  {
    id: "alert-check",
    name: "Price/volume alert check",
    triggers: [
      { cron: "*/5 * * * *" },
      { event: "alerts/check.requested" },
    ],
  },
  async ({ step }) => {
    const alerts = await step.run("load-active-alerts", async () => {
      const supabase = createAdminSupabaseClient();
      const { data, error } = await supabase
        .from("alerts")
        .select("id, user_id, symbol, company_name, alert_type, threshold, last_triggered_at, cooldown_minutes")
        .eq("active", true);
      if (error) throw new Error(`load-active-alerts: ${error.message}`);
      return (data ?? []) as AlertRecord[];
    });

    if (alerts.length === 0) {
      return { evaluated: 0, triggered: 0 };
    }

    const symbols = [...new Set(alerts.map((a) => a.symbol))];

    const latestBySymbol = await step.run("load-latest-snapshots", async () => {
      const supabase = createAdminSupabaseClient();
      const { data, error } = await supabase
        .from("market_snapshots")
        .select("symbol, price, volume, source, fetched_at")
        .in("symbol", symbols)
        .order("fetched_at", { ascending: false })
        .limit(symbols.length * 10);
      if (error) throw new Error(`load-latest-snapshots: ${error.message}`);

      const map = new Map<string, LatestReading>();
      for (const row of data ?? []) {
        const cur = map.get(row.symbol);
        if (
          !cur ||
          row.fetched_at > cur.fetched_at ||
          (row.fetched_at === cur.fetched_at && row.source === "yahoo")
        ) {
          map.set(row.symbol, { price: row.price, volume: row.volume, fetched_at: row.fetched_at });
        }
      }
      return Object.fromEntries(map);
    });

    const now = Date.now();
    const toFire = alerts.filter((alert) => {
      const reading = latestBySymbol[alert.symbol];
      if (!reading) return false;
      if (onCooldown(alert, now)) return false;
      return isTriggered(alert, reading);
    });

    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/watchlist`;

    let sent = 0;
    for (const alert of toFire) {
      const reading = latestBySymbol[alert.symbol];

      const email = await step.run(`resolve-email-${alert.id}`, () => resolveEmail(alert.user_id));

      if (email) {
        const delivered = await step.run(`send-email-${alert.id}`, () =>
          sendAlertEmail({
            to: email,
            symbol: alert.symbol,
            companyName: alert.company_name,
            alertType: alert.alert_type,
            threshold: alert.threshold,
            currentValue: alert.alert_type === "volume_above" ? (reading.volume ?? 0) : reading.price,
            dashboardUrl,
          }),
        );
        if (delivered) sent++;
      }

      // Record the trigger regardless of email success — the cooldown exists
      // to protect the user's inbox from a choppy stock re-firing every 5
      // minutes, not to retry a flaky provider; a stuck RESEND_API_KEY issue
      // should surface in logs, not as a burst of alerts once fixed.
      await step.run(`mark-triggered-${alert.id}`, async () => {
        const supabase = createAdminSupabaseClient();
        const { error } = await supabase
          .from("alerts")
          .update({ last_triggered_at: new Date().toISOString() })
          .eq("id", alert.id);
        if (error) console.error(`[alert-check] mark-triggered ${alert.id} failed: ${error.message}`);
      });
    }

    return { evaluated: alerts.length, triggered: toFire.length, emailsSent: sent };
  },
);
