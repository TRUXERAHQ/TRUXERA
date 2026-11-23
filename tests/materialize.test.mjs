import assert from "node:assert/strict";
import test from "node:test";
import { resolveSharedField } from "../src/integrations/materialize/policy.ts";
import {
  deriveExternalLoadReference,
  mcleodOperationalMapper,
} from "../src/integrations/materialize/mcleod.ts";
import { materializeExternalRecords } from "../src/integrations/materialize/materializer.ts";

const ORG = "org-1";
const OTHER_ORG = "org-2";
const INT = "int-1";
const PROVIDER = "mcleod-track-and-trace";

function loadPayload(overrides = {}) {
  return {
    orderId: "ORD-1001",
    billToCustomerCode: "CUST-77",
    pickup: {
      location: "Dallas, TX 75201",
      scheduledArrivalEarly: "2026-01-10T08:00:00Z",
      scheduledArrivalLate: "2026-01-10T10:00:00Z",
    },
    ...overrides,
  };
}

function deliveryPayload(overrides = {}) {
  return {
    orderId: "ORD-1001",
    externalId: "ORD-1001:stop:1",
    sequenceNumber: 1,
    location: "Austin, TX 78701",
    scheduledArrivalEarly: "2026-01-11T09:00:00Z",
    scheduledArrivalLate: "2026-01-11T12:00:00Z",
    eta: "2026-01-11T10:30:00Z",
    ...overrides,
  };
}

function makeRepository(seed = {}) {
  const state = {
    externalRecords: new Map(),
    loads: new Map(),
    deliveries: new Map(),
    events: [],
    loadSeq: 0,
    deliverySeq: 0,
    ...seed,
  };

  const key = (r) =>
    `${r.organizationId}|${r.providerKey}|${r.entityKind}|${r.externalId}`;

  return {
    state,
    async findExternalRecord({ organizationId, providerKey, entityKind, externalId }) {
      const rec = state.externalRecords.get(
        `${organizationId}|${providerKey}|${entityKind}|${externalId}`,
      );
      return rec
        ? {
            id: rec.id,
            internalKind: rec.internalKind ?? null,
            internalId: rec.internalId ?? null,
            payload: rec.payload ?? null,
          }
        : null;
    },
    async findLoadById({ organizationId, id }) {
      const row = state.loads.get(id);
      return row && row.organizationId === organizationId ? row : null;
    },
    async findLoadByReference({ organizationId, reference }) {
      for (const row of state.loads.values()) {
        if (row.organizationId === organizationId && row.reference === reference) {
          return { id: row.id };
        }
      }
      return null;
    },
    async createLoad({ organizationId, fields }) {
      const id = `load-${++state.loadSeq}`;
      state.loads.set(id, { id, organizationId, ...fields });
      return { id };
    },
    async updateLoadFields({ organizationId, id, fields }) {
      const row = state.loads.get(id);
      assert.equal(row.organizationId, organizationId);
      Object.assign(row, fields);
    },
    async findDeliveryById({ organizationId, id }) {
      const row = state.deliveries.get(id);
      return row && row.organizationId === organizationId ? row : null;
    },
    async createDelivery({ organizationId, loadId, stopNumber, fields }) {
      const id = `del-${++state.deliverySeq}`;
      state.deliveries.set(id, {
        id,
        organizationId,
        loadId,
        stopNumber,
        reference: null,
        recipientName: null,
        status: "PLANNED",
        riskLevel: "LOW",
        deliveredAt: null,
        ...fields,
      });
      return { id };
    },
    async updateDeliveryFields({ organizationId, id, fields }) {
      const row = state.deliveries.get(id);
      assert.equal(row.organizationId, organizationId);
      Object.assign(row, fields);
    },
    async maxDeliveryStopNumber({ organizationId, loadId }) {
      let max = 0;
      for (const row of state.deliveries.values()) {
        if (row.organizationId === organizationId && row.loadId === loadId) {
          max = Math.max(max, row.stopNumber);
        }
      }
      return max;
    },
    async linkExternalRecord({ organizationId, recordId, internalKind, internalId }) {
      for (const r of state.externalRecords.values()) {
        if (r.id === recordId && r.organizationId === organizationId) {
          r.internalKind = internalKind;
          r.internalId = internalId;
        }
      }
    },
    async recordEvent(input) {
      state.events.push(input);
    },
  };
}

function seedExternalRecord(state, { entityKind, externalId, payload, previousPayload = null, internalId = null }) {
  const id = `rec-${entityKind}-${externalId}`;
  state.externalRecords.set(`${ORG}|${PROVIDER}|${entityKind}|${externalId}`, {
    id,
    organizationId: ORG,
    providerKey: PROVIDER,
    entityKind,
    externalId,
    internalKind: internalId ? (entityKind === "LOAD" ? "Load" : "Delivery") : null,
    internalId,
    payload: JSON.stringify(payload),
    previousPayload,
  });
  return {
    providerKey: PROVIDER,
    entityKind,
    externalId,
    recordId: id,
    previousPayload,
  };
}

function ctx() {
  return {
    organizationId: ORG,
    integrationId: INT,
    providerKey: PROVIDER,
  };
}

test("policy: shared field writes only while external still owns the value", () => {
  assert.deepEqual(
    resolveSharedField({ dbValue: "old", previousExternalValue: "old", newExternalValue: "new" }),
    { action: "write", value: "new" },
  );
  assert.deepEqual(
    resolveSharedField({ dbValue: "manual", previousExternalValue: "old", newExternalValue: "new" }),
    { action: "keep-manual" },
  );
  assert.deepEqual(
    resolveSharedField({ dbValue: "same", previousExternalValue: "old", newExternalValue: "same" }),
    { action: "noop" },
  );
  assert.deepEqual(
    resolveSharedField({ dbValue: null, previousExternalValue: null, newExternalValue: "x" }),
    { action: "write", value: "x" },
  );
});

test("mcleod mapper produces honest load and delivery fields", () => {
  const load = mcleodOperationalMapper.mapLoad(loadPayload());
  assert.equal(load.customerName, "CUST-77");
  assert.equal(load.pickupAddress, "Dallas, TX 75201");
  assert.match(load.reference, /^EXT-MCLEOD-TRACK-AND-TRACE-ORD-1001$/);

  const delivery = mcleodOperationalMapper.mapDelivery(deliveryPayload());
  assert.equal(delivery.orderExternalId, "ORD-1001");
  assert.equal(delivery.destinationAddress, "Austin, TX 78701");
  assert.equal(delivery.stopSortKey, 1);

  assert.equal(mcleodOperationalMapper.mapLoad({}), null);
  assert.equal(mcleodOperationalMapper.mapLoad(loadPayload({ billToCustomerCode: null })), null);
  assert.equal(mcleodOperationalMapper.mapDelivery(deliveryPayload({ location: null })), null);
});

test("first sync materializes load then delivery with stable links", async () => {
  const repo = makeRepository();
  const { state } = repo;
  const loadRef = seedExternalRecord(state, { entityKind: "LOAD", externalId: "ORD-1001", payload: loadPayload() });
  const delRef = seedExternalRecord(state, { entityKind: "DELIVERY", externalId: "ORD-1001:stop:1", payload: deliveryPayload() });

  // Pass delivery first on purpose — orchestrator must order LOAD before DELIVERY.
  const outcome = await materializeExternalRecords({
    repository: repo,
    mapper: mcleodOperationalMapper,
    ...ctx(),
    refs: [delRef, loadRef],
  });

  assert.deepEqual(outcome, { mapped: 2, updated: 0, unchanged: 0, failed: 0 });
  assert.equal(state.loads.size, 1);
  assert.equal(state.deliveries.size, 1);

  const load = [...state.loads.values()][0];
  const delivery = [...state.deliveries.values()][0];
  assert.equal(delivery.loadId, load.id);
  assert.equal(delivery.stopNumber, 1);
  assert.equal(delivery.status, "PLANNED");
  assert.equal(delivery.riskLevel, "LOW");
  assert.equal(delivery.eta, "2026-01-11T10:30:00.000Z");

  const loadRec = state.externalRecords.get(`${ORG}|${PROVIDER}|LOAD|ORD-1001`);
  const delRec = state.externalRecords.get(`${ORG}|${PROVIDER}|DELIVERY|ORD-1001:stop:1`);
  assert.equal(loadRec.internalKind, "Load");
  assert.equal(loadRec.internalId, load.id);
  assert.equal(delRec.internalKind, "Delivery");
  assert.equal(delRec.internalId, delivery.id);

  const kinds = state.events.map((e) => e.kind);
  assert.ok(kinds.every((k) => k === "EXTERNAL_RECORD_MAPPED"));
});

test("unchanged re-sync is a no-op and repeated sync is idempotent", async () => {
  const repo = makeRepository();
  const { state } = repo;
  const refs = [
    seedExternalRecord(state, { entityKind: "LOAD", externalId: "ORD-1001", payload: loadPayload() }),
    seedExternalRecord(state, { entityKind: "DELIVERY", externalId: "ORD-1001:stop:1", payload: deliveryPayload() }),
  ];
  await materializeExternalRecords({ repository: repo, mapper: mcleodOperationalMapper, ...ctx(), refs });

  // Simulate a second sync where checksums were unchanged: no changed refs.
  const outcome = await materializeExternalRecords({
    repository: repo,
    mapper: mcleodOperationalMapper,
    ...ctx(),
    refs: [],
  });
  assert.deepEqual(outcome, { mapped: 0, updated: 0, unchanged: 0, failed: 0 });
  assert.equal(state.loads.size, 1);
  assert.equal(state.deliveries.size, 1);

  // Re-materializing the same linked records with identical payload is a no-op.
  const linkedRefs = [
    { ...refs[0] },
    { ...refs[1] },
  ];
  const second = await materializeExternalRecords({
    repository: repo,
    mapper: mcleodOperationalMapper,
    ...ctx(),
    refs: linkedRefs,
  });
  assert.equal(second.mapped, 0);
  assert.equal(second.failed, 0);
  assert.equal(state.loads.size, 1);
  assert.equal(state.deliveries.size, 1);
});

test("changed external values refresh shared fields but preserve manual edits", async () => {
  const repo = makeRepository();
  const { state } = repo;
  const oldLoad = loadPayload();
  const oldDel = deliveryPayload();
  const refs = [
    seedExternalRecord(state, { entityKind: "LOAD", externalId: "ORD-1001", payload: oldLoad }),
    seedExternalRecord(state, { entityKind: "DELIVERY", externalId: "ORD-1001:stop:1", payload: oldDel }),
  ];
  await materializeExternalRecords({ repository: repo, mapper: mcleodOperationalMapper, ...ctx(), refs });

  const load = [...state.loads.values()][0];
  const delivery = [...state.deliveries.values()][0];

  // Manual edits to shared fields.
  load.customerName = "MANUAL-CUSTOMER";
  delivery.destinationAddress = "MANUAL-DEST";

  const newLoadPayload = loadPayload({
    pickup: { ...oldLoad.pickup, location: "Houston, TX 77001" },
  });
  const newDelPayload = deliveryPayload({
    location: "San Antonio, TX 78201",
    eta: "2026-01-11T11:00:00Z",
  });

  // previousPayload carries the old external values for ownership comparison.
  const updatedRefs = [
    {
      ...refs[0],
      previousPayload: JSON.stringify(oldLoad),
    },
    {
      ...refs[1],
      previousPayload: JSON.stringify(oldDel),
    },
  ];
  // Refresh stored payloads to the new values (as upsert would have done).
  for (const r of state.externalRecords.values()) {
    r.payload = JSON.stringify(r.entityKind === "LOAD" ? newLoadPayload : newDelPayload);
  }

  const outcome = await materializeExternalRecords({
    repository: repo,
    mapper: mcleodOperationalMapper,
    ...ctx(),
    refs: updatedRefs,
  });
  assert.equal(outcome.failed, 0);

  // Manual edits preserved.
  assert.equal(load.customerName, "MANUAL-CUSTOMER");
  assert.equal(delivery.destinationAddress, "MANUAL-DEST");
  // Non-conflicting shared fields still refresh: pickupAddress changed upstream.
  assert.equal(load.pickupAddress, "Houston, TX 77001");
  // ETA is external-shared and was not manually edited → refreshed.
  assert.equal(delivery.eta, "2026-01-11T11:00:00.000Z");
});

test("TRUXERA-owned fields are never written by materialization", async () => {
  const repo = makeRepository();
  const { state } = repo;
  const load = seedExternalRecord(state, {
    entityKind: "LOAD",
    externalId: "ORD-1001",
    payload: loadPayload(),
  });
  const del = seedExternalRecord(state, {
    entityKind: "DELIVERY",
    externalId: "ORD-1001:stop:1",
    payload: deliveryPayload({ status: "DELIVERED", actualDelivery: "2026-01-11T13:00:00Z" }),
  });

  await materializeExternalRecords({
    repository: repo,
    mapper: mcleodOperationalMapper,
    ...ctx(),
    refs: [load, del],
  });

  const delivery = [...state.deliveries.values()][0];
  assert.equal(delivery.status, "PLANNED");
  assert.equal(delivery.riskLevel, "LOW");
  assert.equal(delivery.deliveredAt, null);
  assert.equal(delivery.recipientName, null);
});

test("missing required fields fail mapping and are audited without partial writes", async () => {
  const repo = makeRepository();
  const { state } = repo;
  const bad = seedExternalRecord(state, {
    entityKind: "LOAD",
    externalId: "ORD-BAD",
    payload: { orderId: "ORD-BAD" }, // no customer/address
  });
  const good = seedExternalRecord(state, {
    entityKind: "LOAD",
    externalId: "ORD-OK",
    payload: loadPayload({ orderId: "ORD-OK" }),
  });

  const outcome = await materializeExternalRecords({
    repository: repo,
    mapper: mcleodOperationalMapper,
    ...ctx(),
    refs: [bad, good],
  });

  assert.equal(outcome.failed, 1);
  assert.equal(outcome.mapped, 1);
  assert.equal(state.loads.size, 1);
  assert.equal(state.loads.get("load-1").reference.includes("ORD-OK"), true);

  const failures = state.events.filter((e) => e.kind === "EXTERNAL_RECORD_MAPPING_FAILED");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].metadata.externalId, "ORD-BAD");
  const badRec = state.externalRecords.get(`${ORG}|${PROVIDER}|LOAD|ORD-BAD`);
  assert.equal(badRec.internalId, null);
});

test("manual load with colliding reference is a conflict, never a merge", async () => {
  const repo = makeRepository();
  const { state } = repo;
  state.loads.set("manual-load", {
    id: "manual-load",
    organizationId: ORG,
    reference: deriveExternalLoadReference(PROVIDER, "ORD-1001"),
    customerName: "Manual Co",
    pickupAddress: "Manual Addr",
  });

  const ref = seedExternalRecord(state, {
    entityKind: "LOAD",
    externalId: "ORD-1001",
    payload: loadPayload(),
  });

  const outcome = await materializeExternalRecords({
    repository: repo,
    mapper: mcleodOperationalMapper,
    ...ctx(),
    refs: [ref],
  });

  assert.equal(outcome.failed, 1);
  assert.equal(state.loads.size, 1);
  const manual = state.loads.get("manual-load");
  assert.equal(manual.customerName, "Manual Co");
  assert.equal(
    state.externalRecords.get(`${ORG}|${PROVIDER}|LOAD|ORD-1001`).internalId,
    null,
  );
  assert.equal(
    state.events.filter((e) => e.kind === "EXTERNAL_RECORD_MAPPING_FAILED").length,
    1,
  );
});

test("cross-tenant isolation: org B records cannot resolve org A operational rows", async () => {
  const repo = makeRepository();
  const { state } = repo;

  // Org A has a materialized load.
  const loadRef = seedExternalRecord(state, {
    entityKind: "LOAD",
    externalId: "ORD-1001",
    payload: loadPayload(),
  });
  await materializeExternalRecords({
    repository: repo,
    mapper: mcleodOperationalMapper,
    ...ctx(),
    refs: [loadRef],
  });
  const orgALoad = [...state.loads.values()][0];

  // Org B external record with the SAME externalId must not link to org A's load.
  state.externalRecords.set(`${OTHER_ORG}|${PROVIDER}|LOAD|ORD-1001`, {
    id: "rec-orgB",
    organizationId: OTHER_ORG,
    providerKey: PROVIDER,
    entityKind: "LOAD",
    externalId: "ORD-1001",
    internalKind: null,
    internalId: null,
    payload: JSON.stringify(loadPayload()),
    previousPayload: null,
  });

  const outcome = await materializeExternalRecords({
    repository: repo,
    mapper: mcleodOperationalMapper,
    organizationId: OTHER_ORG,
    integrationId: "int-B",
    providerKey: PROVIDER,
    refs: [
      {
        providerKey: PROVIDER,
        entityKind: "LOAD",
        externalId: "ORD-1001",
        recordId: "rec-orgB",
        previousPayload: null,
      },
    ],
  });

  // Org B gets its OWN load — never org A's.
  assert.equal(outcome.mapped, 1);
  assert.equal(state.loads.size, 2);
  const orgBLoad = [...state.loads.values()].find((l) => l.organizationId === OTHER_ORG);
  assert.ok(orgBLoad);
  assert.notEqual(orgBLoad.id, orgALoad.id);
  assert.equal(orgALoad.organizationId, ORG);

  // Org B delivery cannot resolve org A's parent load either.
  state.externalRecords.set(`${OTHER_ORG}|${PROVIDER}|DELIVERY|ORD-1001:stop:1`, {
    id: "rec-orgB-del",
    organizationId: OTHER_ORG,
    providerKey: PROVIDER,
    entityKind: "DELIVERY",
    externalId: "ORD-1001:stop:1",
    internalKind: null,
    internalId: null,
    payload: JSON.stringify(deliveryPayload()),
    previousPayload: null,
  });
  // Org B has no LOAD link yet → delivery must fail, not attach to org A.
  state.externalRecords.get(`${OTHER_ORG}|${PROVIDER}|LOAD|ORD-1001`).internalId = null;

  const delOutcome = await materializeExternalRecords({
    repository: repo,
    mapper: mcleodOperationalMapper,
    organizationId: OTHER_ORG,
    integrationId: "int-B",
    providerKey: PROVIDER,
    refs: [
      {
        providerKey: PROVIDER,
        entityKind: "DELIVERY",
        externalId: "ORD-1001:stop:1",
        recordId: "rec-orgB-del",
        previousPayload: null,
      },
    ],
  });
  assert.equal(delOutcome.failed, 1);
  assert.equal(state.deliveries.size, 0);
});

test("delivery without materialized parent load fails without creating rows", async () => {
  const repo = makeRepository();
  const { state } = repo;
  const del = seedExternalRecord(state, {
    entityKind: "DELIVERY",
    externalId: "ORD-ORPHAN:stop:1",
    payload: deliveryPayload({ orderId: "ORD-ORPHAN", externalId: "ORD-ORPHAN:stop:1" }),
  });
  const outcome = await materializeExternalRecords({
    repository: repo,
    mapper: mcleodOperationalMapper,
    ...ctx(),
    refs: [del],
  });
  assert.equal(outcome.failed, 1);
  assert.equal(state.deliveries.size, 0);
  assert.equal(state.loads.size, 0);
});

test("new stops get deterministic stop numbers after existing ones", async () => {
  const repo = makeRepository();
  const { state } = repo;
  const loadRef = seedExternalRecord(state, { entityKind: "LOAD", externalId: "ORD-1001", payload: loadPayload() });
  const refs = [loadRef];
  await materializeExternalRecords({ repository: repo, mapper: mcleodOperationalMapper, ...ctx(), refs });

  const stop1 = seedExternalRecord(state, {
    entityKind: "DELIVERY",
    externalId: "ORD-1001:stop:1",
    payload: deliveryPayload(),
  });
  const stop2 = seedExternalRecord(state, {
    entityKind: "DELIVERY",
    externalId: "ORD-1001:stop:2",
    payload: deliveryPayload({
      externalId: "ORD-1001:stop:2",
      sequenceNumber: 2,
      location: "Galveston, TX 77550",
    }),
  });
  const outcome = await materializeExternalRecords({
    repository: repo,
    mapper: mcleodOperationalMapper,
    ...ctx(),
    refs: [stop2, stop1], // reversed input order
  });
  assert.equal(outcome.failed, 0);
  const stops = [...state.deliveries.values()].sort((a, b) => a.stopNumber - b.stopNumber);
  assert.equal(stops.length, 2);
  assert.equal(stops[0].stopNumber, 1);
  assert.equal(stops[0].destinationAddress, "Austin, TX 78701");
  assert.equal(stops[1].stopNumber, 2);
  assert.equal(stops[1].destinationAddress, "Galveston, TX 77550");
});
