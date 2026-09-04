/**
 * Standalone verification for lib/alerts/evaluate.ts, the pure logic behind
 * lib/inngest/functions/alert-check.ts (phase10.md task 1) — same tsx-based
 * pattern as verify-scoring/verify-digest/verify-thesis/verify-reconcile (no
 * jest/vitest in this repo). Covers isTriggered()'s three alert types and
 * onCooldown()'s boundary condition — the two pure functions a phase10.md-
 * mandated code-review pass specifically flagged for off-by-one checks.
 * Run with `npm run verify:alerts`.
 */
import { isTriggered, onCooldown, type AlertRecord, type LatestReading } from "../lib/alerts/evaluate";

let failures = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`PASS: ${message}`);
  }
}

function alert(overrides: Partial<AlertRecord> = {}): AlertRecord {
  return {
    alert_type: "price_above",
    threshold: 100,
    last_triggered_at: null,
    cooldown_minutes: 60,
    ...overrides,
  };
}

function reading(overrides: Partial<LatestReading> = {}): LatestReading {
  return { price: 100, volume: 1000, fetched_at: "2026-01-01T10:00:00.000Z", ...overrides };
}

// --- isTriggered: price_above -----------------------------------------------
assert(
  isTriggered(alert({ alert_type: "price_above", threshold: 100 }), reading({ price: 100 })),
  "price_above triggers exactly at the threshold (>=)",
);
assert(
  isTriggered(alert({ alert_type: "price_above", threshold: 100 }), reading({ price: 100.01 })),
  "price_above triggers above the threshold",
);
assert(
  !isTriggered(alert({ alert_type: "price_above", threshold: 100 }), reading({ price: 99.99 })),
  "price_above does not trigger below the threshold",
);

// --- isTriggered: price_below ------------------------------------------------
assert(
  isTriggered(alert({ alert_type: "price_below", threshold: 100 }), reading({ price: 100 })),
  "price_below triggers exactly at the threshold (<=)",
);
assert(
  isTriggered(alert({ alert_type: "price_below", threshold: 100 }), reading({ price: 99.99 })),
  "price_below triggers below the threshold",
);
assert(
  !isTriggered(alert({ alert_type: "price_below", threshold: 100 }), reading({ price: 100.01 })),
  "price_below does not trigger above the threshold",
);

// --- isTriggered: volume_above -----------------------------------------------
assert(
  isTriggered(alert({ alert_type: "volume_above", threshold: 1000 }), reading({ volume: 1000 })),
  "volume_above triggers exactly at the threshold (>=)",
);
assert(
  isTriggered(alert({ alert_type: "volume_above", threshold: 1000 }), reading({ volume: 1001 })),
  "volume_above triggers above the threshold",
);
assert(
  !isTriggered(alert({ alert_type: "volume_above", threshold: 1000 }), reading({ volume: 999 })),
  "volume_above does not trigger below the threshold",
);
assert(
  !isTriggered(alert({ alert_type: "volume_above", threshold: 1000 }), reading({ volume: null })),
  "volume_above never triggers on a null volume reading, even with a low threshold",
);

// --- onCooldown: boundary + no-prior-trigger ---------------------------------
const now = new Date("2026-01-01T11:00:00.000Z").getTime();

assert(
  !onCooldown(alert({ last_triggered_at: null }), now),
  "an alert that has never fired is never on cooldown",
);

const cooldownMs = 60 * 60_000;
assert(
  onCooldown(alert({ cooldown_minutes: 60, last_triggered_at: new Date(now - cooldownMs + 1000).toISOString() }), now),
  "on cooldown 1s before the window elapses",
);
assert(
  !onCooldown(alert({ cooldown_minutes: 60, last_triggered_at: new Date(now - cooldownMs).toISOString() }), now),
  "off cooldown at the exact boundary (elapsed >= cooldown_minutes is not '< cooldown')",
);
assert(
  !onCooldown(alert({ cooldown_minutes: 60, last_triggered_at: new Date(now - cooldownMs - 1000).toISOString() }), now),
  "off cooldown 1s past the window",
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll alert-check checks passed.");
}
