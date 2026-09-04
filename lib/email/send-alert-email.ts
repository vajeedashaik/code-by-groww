import "server-only";
import type { AlertType } from "@/lib/alerts/types";
import { getResendClient, isEmailConfigured, ALERT_FROM_ADDRESS } from "@/lib/email/resend";
import { buildAlertEmailHtml } from "@/lib/email/alert-template";

/**
 * Sends one triggered-alert email. Returns false (never throws) when email
 * isn't configured or the send fails — the caller (the Inngest alert-check
 * job) still records the trigger either way so a flaky provider can't spam
 * the same threshold every cron tick; see alert-check.ts's cooldown logic.
 */
export async function sendAlertEmail(params: {
  to: string;
  symbol: string;
  companyName: string | null;
  alertType: AlertType;
  threshold: number;
  currentValue: number;
  dashboardUrl: string;
}): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.warn(`[send-alert-email] RESEND_API_KEY not set — skipping email for ${params.symbol}`);
    return false;
  }

  const { subject, html } = buildAlertEmailHtml(params);

  try {
    const { error } = await getResendClient().emails.send({
      from: ALERT_FROM_ADDRESS,
      to: params.to,
      subject,
      html,
    });
    if (error) {
      console.error(`[send-alert-email] ${params.symbol} send failed: ${error.message}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      `[send-alert-email] ${params.symbol} send threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
