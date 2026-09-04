import "server-only";
import { Resend } from "resend";

/**
 * Lazy singleton — constructed on first send, not at module load, so a
 * missing RESEND_API_KEY doesn't crash every server render that happens to
 * import this module transitively. Callers check `isEmailConfigured()`
 * first and degrade gracefully (log + skip) when it's false, same pattern
 * as FINNHUB_API_KEY elsewhere in this app.
 */
let client: Resend | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function getResendClient(): Resend {
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

/** From address for every outbound email. Resend's shared test domain works with zero setup for local/demo use. */
export const ALERT_FROM_ADDRESS = process.env.ALERT_FROM_EMAIL ?? "Groww Pulse <onboarding@resend.dev>";
