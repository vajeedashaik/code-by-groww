import "server-only";
import { Inngest } from "inngest";

/**
 * Single Inngest client for the app. `id` is the app slug the Inngest dev
 * server and Inngest Cloud use to group functions. No event/signing keys are
 * needed for local dev — `npx inngest-cli dev` discovers functions by polling
 * http://localhost:3000/api/inngest. For a Cloud deploy, set INNGEST_EVENT_KEY
 * and INNGEST_SIGNING_KEY in the environment and they are picked up here
 * automatically.
 *
 * `isDev` pins dev mode outside production so the local /api/inngest route
 * works without a signing key (in cloud mode the SDK refuses to serve without
 * INNGEST_SIGNING_KEY). Production still resolves to cloud mode.
 */
export const inngest = new Inngest({
  id: "smart-market-watchlist",
  isDev: process.env.NODE_ENV !== "production",
});
