import type { AlertType } from "@/lib/alerts/types";

/**
 * Pure alert-evaluation logic, split out of
 * lib/inngest/functions/alert-check.ts (phase10.md task 1) so it can be
 * imported by scripts/verify-alerts.ts without dragging in that file's
 * `server-only`/Clerk/Supabase/Inngest imports — same "pure lib, thin
 * orchestration wrapper" split already used for reconciliation
 * (lib/market-data/reconcile.ts) and thesis triggering (lib/thesis/trigger.ts).
 * No I/O, no side effects.
 */

export interface AlertRecord {
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

export function isTriggered(alert: AlertRecord, reading: LatestReading): boolean {
  switch (alert.alert_type) {
    case "price_above":
      return reading.price >= alert.threshold;
    case "price_below":
      return reading.price <= alert.threshold;
    case "volume_above":
      return reading.volume !== null && reading.volume >= alert.threshold;
  }
}

export function onCooldown(alert: AlertRecord, now: number): boolean {
  if (!alert.last_triggered_at) return false;
  const elapsedMs = now - new Date(alert.last_triggered_at).getTime();
  return elapsedMs < alert.cooldown_minutes * 60_000;
}
