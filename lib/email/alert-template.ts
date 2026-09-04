import type { AlertType } from "@/lib/alerts/types";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function formatValue(alertType: AlertType, value: number): string {
  return alertType === "volume_above" ? value.toLocaleString("en-IN") : inr.format(value);
}

const COPY: Record<AlertType, { verb: string; noun: string }> = {
  price_above: { verb: "rose above", noun: "price" },
  price_below: { verb: "fell below", noun: "price" },
  volume_above: { verb: "rose above", noun: "volume" },
};

/**
 * Inline-styled HTML — email clients strip <style> blocks and ignore most
 * CSS, so every rule here is inline on purpose. Built with template literals
 * (not string.replace on a placeholder template) so a value that happens to
 * contain another placeholder-looking substring can never corrupt the
 * output.
 */
export function buildAlertEmailHtml(params: {
  symbol: string;
  companyName: string | null;
  alertType: AlertType;
  threshold: number;
  currentValue: number;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const { symbol, companyName, alertType, threshold, currentValue, dashboardUrl } = params;
  const { verb, noun } = COPY[alertType];
  const name = companyName ? `${symbol} (${companyName})` : symbol;

  const subject = `${symbol} ${noun} alert — ${verb} ${formatValue(alertType, threshold)}`;

  const html = `
<div style="background:#050506;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#0b0c0e;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:32px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
      <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:#00d084;"></span>
      <span style="color:#ffffff;font-weight:700;font-size:16px;">Groww<span style="color:#00d084;"> Pulse</span></span>
    </div>
    <p style="color:rgba(255,255,255,0.4);font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;">
      Alert triggered
    </p>
    <h1 style="color:#ffffff;font-size:22px;line-height:1.3;margin:0 0 16px;">
      ${name} ${noun} ${verb} your threshold
    </h1>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;color:rgba(255,255,255,0.4);font-size:13px;">Your threshold</td>
        <td style="padding:8px 0;color:#ffffff;font-size:13px;text-align:right;">${formatValue(alertType, threshold)}</td>
      </tr>
      <tr style="border-top:1px solid rgba(255,255,255,0.08);">
        <td style="padding:8px 0;color:rgba(255,255,255,0.4);font-size:13px;">Current ${noun}</td>
        <td style="padding:8px 0;color:#00d084;font-size:13px;font-weight:600;text-align:right;">${formatValue(alertType, currentValue)}</td>
      </tr>
    </table>
    <a href="${dashboardUrl}" style="display:inline-block;background:linear-gradient(155deg,#5bffc0,#00a568);color:#000000;font-weight:600;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:999px;">
      View on Groww Pulse
    </a>
    <p style="color:rgba(255,255,255,0.25);font-size:11px;margin:24px 0 0;">
      You're receiving this because you set a ${noun} alert for ${symbol}. Manage or remove it from your watchlist.
    </p>
  </div>
</div>`.trim();

  return { subject, html };
}
