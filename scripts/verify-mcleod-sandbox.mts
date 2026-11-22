// Read-only McLeod Track & Trace sandbox verification.
// Credentials come ONLY from environment variables — never hard-code them.
// Prints status/counts only; never prints credential values.
//
// Required env:
//   MCLEOD_TNT_API_KEY       — Innovation Hub trial API key (X-Api-Key)
//   MCLEOD_TNT_ACCESS_TOKEN  — sandbox bearer token (Authorization)
//   MCLEOD_TNT_TENANT        — optional, defaults to "2"
//   MCLEOD_TNT_BASE_URL      — optional, defaults to sandbox base URL
//
// Usage: node --experimental-strip-types scripts/verify-mcleod-sandbox.mts

import { createMcLeodTrackAndTraceConnector } from "../src/integrations/connectors/mcleod-track-and-trace.ts";
import type {
  ConnectionContext,
  SyncContext,
} from "../src/integrations/connector.ts";

const apiKey = process.env.MCLEOD_TNT_API_KEY;
const accessToken = process.env.MCLEOD_TNT_ACCESS_TOKEN;

if (!apiKey || !accessToken) {
  console.error(
    "Missing MCLEOD_TNT_API_KEY / MCLEOD_TNT_ACCESS_TOKEN environment variables.",
  );
  process.exit(2);
}

const connector = createMcLeodTrackAndTraceConnector();
const ctx: ConnectionContext = {
  organizationId: "sandbox-verify",
  integrationId: "sandbox-verify",
  providerKey: "mcleod-track-and-trace",
  config: {
    tenantId: process.env.MCLEOD_TNT_TENANT || "2",
    ...(process.env.MCLEOD_TNT_BASE_URL
      ? { baseUrl: process.env.MCLEOD_TNT_BASE_URL }
      : {}),
  },
  credential: { kind: "API_KEY_BEARER" as const, apiKey, accessToken },
};

const check = await connector.verifyConnection!(ctx);
console.log("verifyConnection:", check.ok ? "OK" : "FAILED", "-", check.detail);
if (!check.ok) process.exit(1);

const result = await connector.fetchChanges({
  ...(ctx as SyncContext),
  trigger: "MANUAL",
  cursor: null,
});
const loads = result.entities.filter((e) => e.kind === "LOAD");
const deliveries = result.entities.filter((e) => e.kind === "DELIVERY");
const withDetail = loads.filter((e) => e.data.detailAvailable === true).length;
const withProgress = loads.filter(
  (e) => Array.isArray(e.data.progressUpdates) && e.data.progressUpdates.length > 0,
).length;

console.log(`orders: ${loads.length}`);
console.log(`delivery stop records: ${deliveries.length}`);
console.log(`orders with detail fetched: ${withDetail}`);
console.log(`orders with progress updates: ${withProgress}`);
console.log("sandbox verification complete (no secrets printed).");
