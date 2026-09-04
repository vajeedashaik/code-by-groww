export type AlertType = "price_above" | "price_below" | "volume_above";

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  price_above: "Price rises above",
  price_below: "Price falls below",
  volume_above: "Volume rises above",
};

export interface AlertRow {
  id: string;
  symbol: string;
  companyName: string | null;
  alertType: AlertType;
  threshold: number;
  active: boolean;
  lastTriggeredAt: string | null;
  cooldownMinutes: number;
}
