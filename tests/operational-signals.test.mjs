import assert from "node:assert/strict";
import test from "node:test";
import { validateSignalInput } from "../src/integrations/signals/ingest.ts";
import {
  DEFAULT_SIGNAL_RESOLUTION_POLICY,
  getSignalPolicy,
  groupSignalsByProvider,
  registerSignalPolicy,
  resetSignalPolicies,
  resolveSignalView,
  resolveWinner,
} from "../src/integrations/signals/policy.ts";
import {
  getFleetEntityExtractor,
  normalizeMatchKey,
  registerFleetEntityExtractor,
  resetFleetEntityExtractors,
} from "../src/integrations/signals/entity-link.ts";

const NOW = new Date("2026-03-01T12:00:00Z");
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000);

function signal(overrides = {}) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    organizationId: "org-1",
    integrationId: null,
    providerKey: "gps-a",
    subjectKind: "TRUCK",
    subjectId: crypto.randomUUID(),
    signalKind: "VEHICLE_LOCATION",
    value: JSON.stringify({ lat: 1, lng: 2 }),
    provenance: "SOURCE_FACT",
    sourceTimestamp: minutesAgo(1),
    ingestedAt: minutesAgo(1),
    sequence: null,
    eventId: null,
    dedupeKey: "",
    clockSkew: false,
    ...overrides,
  };
}

test("ingest validation accepts a well-formed signal", () => {
  const r = validateSignalInput({
    subjectKind: "TRUCK",
    subjectId: crypto.randomUUID(),
    signalKind: "VEHICLE_LOCATION",
    value: { lat: 1 },
    provenance: "SOURCE_FACT",
    sourceTimestamp: NOW.toISOString(),
    sequence: 7,
    eventId: "evt-1",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.input.sequence, 7);
    assert.equal(r.input.eventId, "evt-1");
  }
});

test("ingest validation rejects bad kind, provenance, timestamp", () => {
  const base = {
    subjectKind: "TRUCK",
    subjectId: "x",
    signalKind: "VEHICLE_LOCATION",
    value: {},
    provenance: "SOURCE_FACT",
    sourceTimestamp: NOW.toISOString(),
  };
  assert.equal(validateSignalInput({ ...base, subjectKind: "SHIP" }).ok, false);
  assert.equal(validateSignalInput({ ...base, signalKind: "lower case!" }).ok, false);
  assert.equal(validateSignalInput({ ...base, provenance: "GUESS" }).ok, false);
  assert.equal(validateSignalInput({ ...base, sourceTimestamp: "not-a-date" }).ok, false);
});

test("groupSignalsByProvider keeps newest per provider by ordering key", () => {
  const subjectId = crypto.randomUUID();
  const older = signal({
    id: "s1",
    providerKey: "gps-a",
    subjectId,
    sourceTimestamp: minutesAgo(10),
    ingestedAt: minutesAgo(10),
    sequence: 1,
  });
  const newer = signal({
    id: "s2",
    providerKey: "gps-a",
    subjectId,
    sourceTimestamp: minutesAgo(5),
    ingestedAt: minutesAgo(5),
    sequence: 2,
  });
  const { candidates } = groupSignalsByProvider(
    [older, newer],
    DEFAULT_SIGNAL_RESOLUTION_POLICY,
    NOW,
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].latest.id, "s2");
});

test("same sourceTimestamp ties break on ingestedAt then sequence", () => {
  const ts = minutesAgo(3);
  const a = signal({ id: "a", providerKey: "p", sourceTimestamp: ts, ingestedAt: ts, sequence: 1 });
  const b = signal({ id: "b", providerKey: "p", sourceTimestamp: ts, ingestedAt: ts, sequence: 9 });
  const c = signal({ id: "c", providerKey: "p", sourceTimestamp: ts, ingestedAt: new Date(ts.getTime() + 1000), sequence: 0 });
  const { candidates } = groupSignalsByProvider([a, b, c], DEFAULT_SIGNAL_RESOLUTION_POLICY, NOW);
  assert.equal(candidates[0].latest.id, "c"); // later ingestedAt wins
});

test("clock-skewed signals are excluded from candidacy and counted", () => {
  const skewed = signal({ id: "skew", clockSkew: true });
  const good = signal({ id: "good", providerKey: "gps-b" });
  const { candidates, skewedCount } = groupSignalsByProvider(
    [skewed, good],
    DEFAULT_SIGNAL_RESOLUTION_POLICY,
    NOW,
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].providerKey, "gps-b");
  assert.equal(skewedCount, 1);
});

test("fresh lower-precedence beats stale higher-precedence when preferFreshness", () => {
  resetSignalPolicies();
  registerSignalPolicy("VEHICLE_LOCATION", {
    precedence: ["premium-gps", "budget-gps"],
    maxSourceAgeMinutes: 60,
    preferFreshness: true,
  });
  const policy = getSignalPolicy("VEHICLE_LOCATION");
  const staleHigh = signal({
    id: "h",
    providerKey: "premium-gps",
    sourceTimestamp: minutesAgo(120),
    ingestedAt: minutesAgo(120),
    value: JSON.stringify({ pos: "high" }),
  });
  const freshLow = signal({
    id: "l",
    providerKey: "budget-gps",
    sourceTimestamp: minutesAgo(10),
    ingestedAt: minutesAgo(10),
    value: JSON.stringify({ pos: "low" }),
  });
  const { view } = resolveSignalView([staleHigh, freshLow], policy, NOW);
  assert.equal(view.providerKey, "budget-gps");
  assert.equal(view.stale, false);
  assert.equal(view.conflict, true); // differing values retained as conflict
  assert.equal(view.alternatives.length, 1);
  assert.equal(view.alternatives[0].providerKey, "premium-gps");
  resetSignalPolicies();
});

test("all-stale candidates: highest precedence wins flagged stale", () => {
  resetSignalPolicies();
  registerSignalPolicy("VEHICLE_LOCATION", {
    precedence: ["premium-gps", "budget-gps"],
    maxSourceAgeMinutes: 60,
    preferFreshness: true,
  });
  const policy = getSignalPolicy("VEHICLE_LOCATION");
  const a = signal({
    providerKey: "premium-gps",
    sourceTimestamp: minutesAgo(200),
    ingestedAt: minutesAgo(200),
    value: JSON.stringify(1),
  });
  const b = signal({
    providerKey: "budget-gps",
    sourceTimestamp: minutesAgo(100),
    ingestedAt: minutesAgo(100),
    value: JSON.stringify(2),
  });
  const { view } = resolveSignalView([a, b], policy, NOW);
  assert.equal(view.providerKey, "premium-gps");
  assert.equal(view.stale, true);
  resetSignalPolicies();
});

test("preferFreshness=false: precedence wins regardless of freshness", () => {
  const policy = {
    precedence: ["premium-gps", "budget-gps"],
    maxSourceAgeMinutes: 60,
    preferFreshness: false,
  };
  const staleHigh = signal({
    providerKey: "premium-gps",
    sourceTimestamp: minutesAgo(500),
    ingestedAt: minutesAgo(500),
    value: JSON.stringify(1),
  });
  const freshLow = signal({
    providerKey: "budget-gps",
    sourceTimestamp: minutesAgo(1),
    ingestedAt: minutesAgo(1),
    value: JSON.stringify(2),
  });
  const { view } = resolveSignalView([staleHigh, freshLow], policy, NOW);
  assert.equal(view.providerKey, "premium-gps");
  assert.equal(view.stale, true);
});

test("equal values across providers produce no conflict", () => {
  const policy = {
    precedence: ["a", "b"],
    maxSourceAgeMinutes: null,
    preferFreshness: true,
  };
  const a = signal({ providerKey: "a", value: JSON.stringify({ x: 1 }) });
  const b = signal({ providerKey: "b", value: JSON.stringify({ x: 1 }) });
  const { view } = resolveSignalView([a, b], policy, NOW);
  assert.equal(view.conflict, false);
  assert.equal(view.alternatives.length, 1);
});

test("only skewed signals yields no resolved view", () => {
  const policy = DEFAULT_SIGNAL_RESOLUTION_POLICY;
  const skewed = signal({ clockSkew: true });
  const { view, skewedCount } = resolveSignalView([skewed], policy, NOW);
  assert.equal(view, null);
  assert.equal(skewedCount, 1);
});

test("entity extractor registry is provider-keyed and resettable", () => {
  resetFleetEntityExtractors();
  assert.equal(getFleetEntityExtractor("none"), null);
  registerFleetEntityExtractor("prov", ({ payload }) => ({
    kind: "TRUCK",
    unitNumber: payload["unit"],
    vin: null,
  }));
  const ex = getFleetEntityExtractor("prov");
  const m = ex({ entityKind: "TRUCK", payload: { unit: "T-1" } });
  assert.equal(m.unitNumber, "T-1");
  resetFleetEntityExtractors();
});

test("normalizeMatchKey trims and rejects empties", () => {
  assert.equal(normalizeMatchKey("  ABC-123 "), "ABC-123");
  assert.equal(normalizeMatchKey("   "), null);
  assert.equal(normalizeMatchKey(42), null);
  assert.equal(normalizeMatchKey(null), null);
});
