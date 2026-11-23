import assert from "node:assert/strict";
import test from "node:test";
import {
  RELIABILITY_THRESHOLDS,
  computeApplicationHealth,
  computeIntegrationReliability,
  sanitizeForDisplay,
  summarizeSyncRuns,
} from "../src/reliability/reliability.ts";

const T0 = new Date("2026-01-01T00:00:00Z");
const at = (minutes) => new Date(T0.getTime() + minutes * 60000);

function run(overrides = {}) {
  return {
    id: "run-1",
    status: "SUCCEEDED",
    trigger: "SCHEDULED",
    recordsSeen: 10,
    recordsCreated: 2,
    recordsUpdated: 8,
    recordsFailed: 0,
    errorCode: null,
    errorSummary: null,
    startedAt: at(0),
    finishedAt: at(1),
    ...overrides,
  };
}

function reliabilityInput(overrides = {}) {
  return {
    status: "CONNECTED",
    health: "HEALTHY",
    freshness: "CURRENT",
    lastSuccessfulSyncAt: at(-30),
    consecutiveFailures: 0,
    lastSyncError: null,
    sync: summarizeSyncRuns([run()]),
    ...overrides,
  };
}

test("summarizeSyncRuns reports latest run, duration, and counts", () => {
  const sync = summarizeSyncRuns([
    run({ id: "new", startedAt: at(10), finishedAt: at(12), recordsSeen: 5 }),
    run({ id: "old", startedAt: at(0), finishedAt: at(1) }),
  ]);
  assert.equal(sync.latestStatus, "SUCCEEDED");
  assert.equal(sync.durationMs, 120000);
  assert.equal(sync.recordsSeen, 5);
  assert.equal(sync.lastSuccessfulAt.getTime(), at(12).getTime());
  assert.equal(sync.consecutiveFailedRuns, 0);
});

test("summarizeSyncRuns counts consecutive failures from newest run", () => {
  const sync = summarizeSyncRuns([
    run({ id: "f3", status: "FAILED", errorCode: "PROVIDER_UNAVAILABLE" }),
    run({ id: "f2", status: "FAILED" }),
    run({ id: "f1", status: "FAILED" }),
    run({ id: "s1", status: "SUCCEEDED" }),
  ]);
  assert.equal(sync.consecutiveFailedRuns, 3);
  assert.equal(sync.lastFailedAt.getTime(), at(1).getTime());
  assert.equal(sync.lastSuccessfulAt.getTime(), at(1).getTime());
  assert.equal(sync.errorCode, "PROVIDER_UNAVAILABLE");
});

test("PARTIAL run counts as synced but not clean", () => {
  const sync = summarizeSyncRuns([
    run({
      id: "p1",
      status: "PARTIAL",
      errorCode: "PARTIAL_FEED",
      errorSummary: "hos-clocks: authorization failed",
    }),
  ]);
  assert.equal(sync.latestStatus, "PARTIAL");
  assert.equal(sync.lastSuccessfulAt.getTime(), at(1).getTime());
  assert.equal(sync.consecutiveFailedRuns, 0);
});

test("empty history yields null latest fields", () => {
  const sync = summarizeSyncRuns([]);
  assert.equal(sync.latestStatus, null);
  assert.equal(sync.lastSuccessfulAt, null);
  assert.equal(sync.consecutiveFailedRuns, 0);
});

test("healthy integration reports HEALTHY with no indicators", () => {
  const result = computeIntegrationReliability(reliabilityInput());
  assert.equal(result.health, "HEALTHY");
  assert.deepEqual(result.indicators, []);
});

test("disconnected integration short-circuits", () => {
  const result = computeIntegrationReliability(
    reliabilityInput({ status: "DISCONNECTED", freshness: "DISCONNECTED" }),
  );
  assert.equal(result.health, "DISCONNECTED");
});

test("never-synced integration reports NEVER_SYNCED", () => {
  const result = computeIntegrationReliability(
    reliabilityInput({
      lastSuccessfulSyncAt: null,
      freshness: "NEVER_SYNCED",
      sync: summarizeSyncRuns([]),
    }),
  );
  assert.equal(result.health, "NEVER_SYNCED");
  assert.ok(result.indicators.some((i) => i.code === "NEVER_SYNCED"));
});

test("three consecutive failed runs report FAILED", () => {
  const sync = summarizeSyncRuns([
    run({ id: "f1", status: "FAILED", errorCode: "AUTHENTICATION_FAILED" }),
    run({ id: "f2", status: "FAILED" }),
    run({ id: "f3", status: "FAILED" }),
    run({ id: "s", status: "SUCCEEDED" }),
  ]);
  const result = computeIntegrationReliability(
    reliabilityInput({
      health: "ERROR",
      freshness: "SYNC_FAILED",
      sync,
    }),
  );
  assert.equal(result.health, "FAILED");
  const codes = result.indicators.map((i) => i.code);
  assert.ok(codes.includes("CONSECUTIVE_FAILURES"));
  assert.ok(codes.includes("LAST_SYNC_FAILED"));
  assert.ok(codes.includes("AUTHENTICATION_FAILURE"));
  assert.ok(codes.includes("SYNC_FAILED_SOURCE"));
});

test("two consecutive failures degrade but do not fail", () => {
  const sync = summarizeSyncRuns([
    run({ id: "f1", status: "FAILED" }),
    run({ id: "f2", status: "FAILED" }),
    run({ id: "s", status: "SUCCEEDED" }),
  ]);
  const result = computeIntegrationReliability(
    reliabilityInput({ health: "DEGRADED", sync }),
  );
  assert.equal(result.health, "DEGRADED");
  assert.ok(!result.indicators.some((i) => i.code === "CONSECUTIVE_FAILURES"));
  assert.ok(result.indicators.some((i) => i.code === "LAST_SYNC_FAILED"));
});

test("PARTIAL latest run degrades and raises feed indicator", () => {
  const sync = summarizeSyncRuns([
    run({ id: "p", status: "PARTIAL", errorCode: "PARTIAL_FEED" }),
    run({ id: "s", status: "SUCCEEDED" }),
  ]);
  const result = computeIntegrationReliability(
    reliabilityInput({ health: "DEGRADED", sync }),
  );
  assert.equal(result.health, "DEGRADED");
  assert.ok(result.indicators.some((i) => i.code === "PARTIAL_SYNC"));
});

test("stale source degrades without failing", () => {
  const result = computeIntegrationReliability(
    reliabilityInput({ freshness: "STALE" }),
  );
  assert.equal(result.health, "DEGRADED");
  assert.ok(result.indicators.some((i) => i.code === "STALE_SOURCE"));
});

test("rate limiting and provider outage map to indicators", () => {
  const sync = summarizeSyncRuns([
    run({ id: "f", status: "FAILED", errorCode: "RATE_LIMITED" }),
    run({ id: "s", status: "SUCCEEDED" }),
  ]);
  const result = computeIntegrationReliability(
    reliabilityInput({ health: "DEGRADED", sync }),
  );
  const codes = result.indicators.map((i) => i.code);
  assert.ok(codes.includes("RATE_LIMITED"));
  assert.ok(codes.includes("LAST_SYNC_FAILED"));
});

test("sanitizeForDisplay redacts secrets and bounds length", () => {
  const dirty = `request failed: Bearer abcdef1234567890 token=sk-live-12345678 ${"x".repeat(400)}`;
  const clean = sanitizeForDisplay(dirty);
  assert.ok(clean);
  assert.doesNotMatch(clean, /abcdef1234567890|sk-live-12345678/i);
  assert.ok(clean.length <= RELIABILITY_THRESHOLDS.maxErrorLength + 1);
  assert.equal(sanitizeForDisplay(null), null);
  assert.equal(sanitizeForDisplay("   "), null);
});

test("application health is coarse and never leaks internals", () => {
  const healthy = computeApplicationHealth({ databaseReachable: true });
  assert.equal(healthy.status, "HEALTHY");
  assert.deepEqual(healthy.checks, { app: "UP", database: "HEALTHY" });

  const down = computeApplicationHealth({ databaseReachable: false });
  assert.equal(down.status, "UNAVAILABLE");
  assert.equal(down.checks.database, "UNAVAILABLE");
  const serialized = JSON.stringify(down);
  assert.doesNotMatch(serialized, /postgres|neon|DATABASE_URL|stack/i);
});

test("threshold constant is explicit and documented", () => {
  assert.equal(RELIABILITY_THRESHOLDS.consecutiveFailuresForError, 3);
  assert.equal(RELIABILITY_THRESHOLDS.syncRunLookback, 200);
});
