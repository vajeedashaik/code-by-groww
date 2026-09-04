"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AlertType } from "@/lib/alerts/types";
import type { ActionResult } from "@/app/(protected)/watchlist/actions";

const VALID_TYPES: AlertType[] = ["price_above", "price_below", "volume_above"];
const MIN_COOLDOWN_MINUTES = 15;

/**
 * Create a price/volume threshold alert. Evaluated on a cron by
 * lib/inngest/functions/alert-check.ts against market_snapshots — this
 * action only validates and persists, it never touches market data itself.
 */
export async function createAlert(input: {
  symbol: string;
  companyName?: string | null;
  alertType: string;
  threshold: string;
}): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, message: "You must be signed in." };

  const symbol = (input.symbol ?? "").trim().toUpperCase();
  if (!symbol) return { ok: false, message: "Missing symbol." };

  const alertType = input.alertType as AlertType;
  if (!VALID_TYPES.includes(alertType)) {
    return { ok: false, message: "Pick a valid alert type." };
  }

  const threshold = Number(input.threshold);
  if (!Number.isFinite(threshold) || threshold <= 0) {
    return { ok: false, message: "Threshold must be a positive number." };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("alerts").insert({
    symbol,
    company_name: (input.companyName ?? "").trim() || null,
    alert_type: alertType,
    threshold,
    cooldown_minutes: MIN_COOLDOWN_MINUTES * 4, // 1h default — enough to avoid inbox spam on a choppy stock
  });

  if (error) {
    return { ok: false, message: "Couldn't create that alert. Try again." };
  }

  revalidatePath("/watchlist");
  return { ok: true, message: `Alert set for ${symbol}.` };
}

/** Owner-scoped delete, same defense-in-depth pattern as removeWatchlistItem. */
export async function removeAlert(id: string): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, message: "You must be signed in." };
  if (!id) return { ok: false, message: "Nothing to remove." };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("alerts")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");

  if (error) {
    return { ok: false, message: "Couldn't remove that alert. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, message: "That alert is already gone." };
  }

  revalidatePath("/watchlist");
  return { ok: true, message: "Alert removed." };
}

/** Pause/resume without losing the threshold — cheaper than delete+recreate for a temporary mute. */
export async function toggleAlert(id: string, active: boolean): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, message: "You must be signed in." };
  if (!id) return { ok: false, message: "Nothing to update." };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("alerts")
    .update({ active })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");

  if (error) {
    return { ok: false, message: "Couldn't update that alert. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, message: "That alert is no longer there." };
  }

  revalidatePath("/watchlist");
  return { ok: true, message: active ? "Alert resumed." : "Alert paused." };
}
