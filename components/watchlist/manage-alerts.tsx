"use client";

import { useState, useTransition } from "react";
import { createAlert, removeAlert, toggleAlert } from "@/app/(protected)/watchlist/alert-actions";
import { ALERT_TYPE_LABEL, type AlertRow, type AlertType } from "@/lib/alerts/types";
import Badge from "@/components/ui/badge";
import { formatPrice } from "@/lib/market-data/currency";

function formatThreshold(symbol: string, alertType: AlertType, value: number): string {
  return alertType === "volume_above" ? value.toLocaleString("en-IN") : formatPrice(symbol, value);
}

/**
 * Inline alert manager for one watchlist row — same expand-in-place shape as
 * EditThesis/RemoveStockButton, so a "form" never feels like a modal
 * detour. Lists existing alerts (with pause/remove) and a compact add form.
 */
export default function ManageAlerts({
  symbol,
  companyName,
  alerts,
}: {
  symbol: string;
  companyName: string | null;
  alerts: AlertRow[];
}) {
  const [open, setOpen] = useState(false);
  const [alertType, setAlertType] = useState<AlertType>("price_above");
  const [threshold, setThreshold] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const activeCount = alerts.filter((a) => a.active).length;

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createAlert({ symbol, companyName, alertType, threshold });
      if (res.ok) {
        setThreshold("");
      } else {
        setError(res.message ?? "Failed.");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:border-pulse/30 hover:bg-white/[0.08] hover:text-pulse"
      >
        {open ? "Hide alerts" : "Alerts"}
        {activeCount > 0 && (
          <Badge tone="pulse" className="ml-1.5">
            {activeCount}
          </Badge>
        )}
      </button>

      {open && (
        <div className="mt-2 max-w-sm space-y-2.5 rounded-2xl border border-white/5 bg-white/[0.03] p-3">
          {alerts.length > 0 && (
            <ul className="space-y-1.5">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className={a.active ? "text-white/70" : "text-white/30 line-through"}>
                    {ALERT_TYPE_LABEL[a.alertType]} {formatThreshold(symbol, a.alertType, a.threshold)}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await toggleAlert(a.id, !a.active);
                        })
                      }
                      className="text-white/35 hover:text-white/70"
                    >
                      {a.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await removeAlert(a.id);
                        })
                      }
                      className="text-white/35 hover:text-down"
                    >
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <select
              value={alertType}
              onChange={(e) => setAlertType(e.target.value as AlertType)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-pulse/50"
            >
              {(Object.entries(ALERT_TYPE_LABEL) as [AlertType, string][]).map(([value, label]) => (
                <option key={value} value={value} className="bg-surface">
                  {label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="Threshold"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-pulse/50"
            />
            <button
              type="button"
              disabled={pending || !threshold}
              onClick={submit}
              className="clay-pulse rounded-lg px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
            >
              {pending ? "Saving…" : "Set"}
            </button>
          </div>
          {error && <p className="text-xs text-down">{error}</p>}
        </div>
      )}
    </div>
  );
}
