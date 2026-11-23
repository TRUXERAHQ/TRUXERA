import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDataQuality,
  computeSourceFreshness,
  DEFAULT_SYNC_INTERVAL_MINUTES,
  isSourceUnavailable,
} from "../src/integrations/connected-signals.ts";
import { buildCommandCenter } from "../src/dashboard/command-center.ts";

const NOW = new Date("2026-03-01T12:00:00Z");
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000);

function freshnessInput(overrides = {}) {
  return {
    status: "CONNECTED",
    lastSyncAt: minutesAgo(5),
    lastSuccessfulSyncAt: minutesAgo(5),
    lastSyncError: null,
    consecutiveFailures: 0,
    latestRunStatus: "SUCCEEDED",
    latestRunFinishedAt: minutesAgo(5),
    expectedIntervalMinutes: null,
    now: NOW,
    ...overrides,
  };
}

test("freshness: CURRENT within assumed 24h interval", () => {
  const r = computeSourceFreshness(freshnessInput());
  assert.equal(r.freshness, "CURRENT");
  assert.equal(r.intervalAssumed, true);
  assert.equal(r.intervalMinutes, DEFAULT_SYNC_INTERVAL_MINUTES);
});

test("freshness: STALE after assumed interval, boundary exact", () => {
  const atBoundary = computeSourceFreshness(
    freshnessInput({ lastSuccessfulSyncAt: minutesAgo(DEFAULT_SYNC_INTERVAL_MINUTES) }),
  );
  assert.equal(atBoundary.freshness, "CURRENT"); // exactly at boundary is not stale
  const past = computeSourceFreshness(
    freshnessInput({ lastSuccessfulSyncAt: minutesAgo(DEFAULT_SYNC_INTERVAL_MINUTES + 1) }),
  );
  assert.equal(past.freshness, "STALE");
});

test("freshness: provider-declared interval takes precedence", () => {
  const r = computeSourceFreshness(
    freshnessInput({
      lastSuccessfulSyncAt: minutesAgo(120),
      expectedIntervalMinutes: 60,
    }),
  );
  assert.equal(r.freshness, "STALE");
  assert.equal(r.intervalAssumed, false);
  assert.equal(r.intervalMinutes, 60);
});

test("freshness: NEVER_SYNCED when no attempts", () => {
  const r = computeSourceFreshness(
    freshnessInput({
      lastSyncAt: null,
      lastSuccessfulSyncAt: null,
      latestRunStatus: null,
      latestRunFinishedAt: null,
    }),
  );
  assert.equal(r.freshness, "NEVER_SYNCED");
});

test("freshness: SYNC_FAILED on consecutive failures and failed latest run", () => {
  const r1 = computeSourceFreshness(freshnessInput({ consecutiveFailures: 2 }));
  assert.equal(r1.freshness, "SYNC_FAILED");
  const r2 = computeSourceFreshness(
    freshnessInput({
      latestRunStatus: "FAILED",
      latestRunFinishedAt: minutesAgo(1),
    }),
  );
  assert.equal(r2.freshness, "SYNC_FAILED");
  const r3 = computeSourceFreshness(
    freshnessInput({
      lastSuccessfulSyncAt: null,
      lastSyncAt: minutesAgo(10),
      latestRunStatus: "FAILED",
      latestRunFinishedAt: minutesAgo(10),
      lastSyncError: "boom",
    }),
  );
  assert.equal(r3.freshness, "SYNC_FAILED");
});

test("freshness: DISCONNECTED wins over everything", () => {
  const r = computeSourceFreshness(
    freshnessInput({ status: "DISCONNECTED", consecutiveFailures: 5 }),
  );
  assert.equal(r.freshness, "DISCONNECTED");
});

test("freshness: deterministic with explicit now", () => {
  const a = computeSourceFreshness(freshnessInput());
  const b = computeSourceFreshness(freshnessInput());
  assert.deepEqual(a, b);
});

test("data quality: MANUAL for unlinked records", () => {
  assert.equal(
    classifyDataQuality({
      linked: false,
      sourceUnavailable: false,
      latestMappingOutcome: null,
      recordLastSyncedAt: null,
      requiredFieldsPresent: true,
      freshness: null,
      intervalMinutes: 1440,
      now: NOW,
    }),
    "MANUAL",
  );
});

test("data quality: precedence SOURCE_UNAVAILABLE > MAPPING_FAILED > SOURCE_STALE > INCOMPLETE > COMPLETE", () => {
  const base = {
    linked: true,
    sourceUnavailable: false,
    latestMappingOutcome: null,
    recordLastSyncedAt: minutesAgo(1),
    requiredFieldsPresent: true,
    freshness: "CURRENT",
    intervalMinutes: 1440,
    now: NOW,
  };
  assert.equal(classifyDataQuality(base), "COMPLETE");
  assert.equal(
    classifyDataQuality({ ...base, requiredFieldsPresent: false }),
    "INCOMPLETE",
  );
  assert.equal(
    classifyDataQuality({ ...base, recordLastSyncedAt: minutesAgo(2000) }),
    "SOURCE_STALE",
  );
  assert.equal(
    classifyDataQuality({ ...base, latestMappingOutcome: "MAPPING_FAILED" }),
    "MAPPING_FAILED",
  );
  assert.equal(
    classifyDataQuality({
      ...base,
      sourceUnavailable: true,
      latestMappingOutcome: "MAPPING_FAILED",
      recordLastSyncedAt: minutesAgo(99999),
      requiredFieldsPresent: false,
    }),
    "SOURCE_UNAVAILABLE",
  );
});

test("isSourceUnavailable covers ERROR/DEGRADED/DISCONNECTED only", () => {
  assert.equal(isSourceUnavailable("DISCONNECTED"), true);
  assert.equal(isSourceUnavailable("ERROR"), true);
  assert.equal(isSourceUnavailable("DEGRADED"), true);
  assert.equal(isSourceUnavailable("CONNECTED"), false);
  assert.equal(isSourceUnavailable("SYNCING"), false);
  assert.equal(isSourceUnavailable("CONNECTING"), false);
});

const ORG = "org-1";

function ccDelivery(id, overrides = {}) {
  return {
    id,
    organizationId: ORG,
    loadId: "load-1",
    reference: null,
    stopNumber: 1,
    status: "IN_TRANSIT",
    riskLevel: "LOW",
    eta: null,
    destinationAddress: "Austin, TX",
    load: {
      organizationId: ORG,
      reference: "L-1",
      customerName: "Acme",
      weightKg: null,
    },
    ...overrides,
  };
}

function ccInput(connectedStates) {
  return {
    organizationId: ORG,
    now: NOW,
    filters: {
      query: "",
      risk: "ANY",
      status: "ANY",
      assignmentState: "ANY",
      truckId: null,
      driverId: null,
      loadId: null,
      requiresAttention: null,
    },
    deliveries: [ccDelivery("del-1")],
    assignments: [],
    events: [],
    analyses: [],
    connectedStates,
  };
}

const connectedState = (overrides = {}) => ({
  internalKind: "Delivery",
  internalId: "del-1",
  providerKey: "mcleod-track-and-trace",
  sourceName: "McLeod Track & Trace",
  freshness: "CURRENT",
  quality: "COMPLETE",
  lastSyncedAt: "2026-03-01T11:00:00Z",
  lastSuccessfulSyncAt: "2026-03-01T11:00:00Z",
  intervalAssumed: true,
  ...overrides,
});

test("command center: connected state attaches without affecting priority", () => {
  const without = buildCommandCenter(ccInput(undefined));
  const withConnected = buildCommandCenter(
    ccInput({ "del-1": connectedState() }),
  );
  const a = without.items[0];
  const b = withConnected.items[0];
  assert.equal(a.connected, null);
  assert.equal(b.connected.sourceName, "McLeod Track & Trace");
  assert.equal(b.priority, a.priority);
  assert.equal(b.requiresAttention, a.requiresAttention);
  assert.equal(b.actionability, a.actionability);
});

test("command center: falls back to load-level link", () => {
  const result = buildCommandCenter(
    ccInput({ "load-1": connectedState({ internalKind: "Load", internalId: "load-1" }) }),
  );
  assert.equal(result.items[0].connected.internalKind, "Load");
});

test("command center: manual delivery has null connected state", () => {
  const result = buildCommandCenter(ccInput({}));
  assert.equal(result.items[0].connected, null);
});
