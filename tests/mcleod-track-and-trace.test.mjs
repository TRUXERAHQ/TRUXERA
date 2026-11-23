import assert from "node:assert/strict";
import test from "node:test";

import {
  createMcLeodTrackAndTraceConnector,
  mapMcLeodOrder,
  MCLEOD_TNT_PROVIDER_KEY,
  MCLEOD_TNT_SANDBOX_BASE_URL,
} from "../src/integrations/connectors/mcleod-track-and-trace.ts";
import {
  parseIntegrationCredentialInput,
  parseStoredCredential,
  serializeCredentialForStorage,
  credentialHint,
} from "../src/integrations/auth.ts";
import { stableChecksum } from "../src/integrations/normalize.ts";
import { IntegrationError } from "../src/integrations/errors.ts";
import {
  getConnector,
  registerConnector,
  resetConnectorRegistry,
} from "../src/integrations/registry.ts";
import { registerBuiltinConnectors } from "../src/integrations/connectors/index.ts";

const SECRET_TOKEN = "sandbox-bearer-token-abcdef123456";
const SECRET_KEY = "trial-api-key-abcdef1234567890";

function credential() {
  return {
    kind: "API_KEY_BEARER",
    apiKey: SECRET_KEY,
    accessToken: SECRET_TOKEN,
  };
}

function ctx(overrides = {}) {
  return {
    organizationId: "org-1",
    integrationId: "int-1",
    providerKey: MCLEOD_TNT_PROVIDER_KEY,
    config: {},
    credential: credential(),
    trigger: "MANUAL",
    cursor: null,
    ...overrides,
  };
}

function jsonResponse(status, body, headers = {}) {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => map.get(name.toLowerCase()) ?? null },
    json: async () => body,
  };
}

function stop(overrides = {}) {
  return {
    sequenceNumber: 2,
    city: "BIRMINGHAM",
    state: "AL",
    postalCode: "35203",
    latitude: 33.5186,
    longitude: -86.8104,
    eta: "2026-11-25T14:00Z",
    scheduledArrivalEarly: "2026-11-25T13:00Z",
    scheduledArrivalLate: "2026-11-25T17:00Z",
    actualArrivalEarly: null,
    actualArrivalLate: null,
    appointmentRequired: true,
    appointmentConfirmed: false,
    referenceNumbers: [
      { qualifierCode: "PO", referenceNumber: "PO-7788" },
    ],
    ...overrides,
  };
}

function order(overrides = {}) {
  return {
    orderId: "100234",
    status: "InProgress",
    consigneeReferenceNumber: "BOL-9911",
    shipmentId: "EDI-4455",
    billToCustomerCode: "CUST01",
    shipperStop: stop({
      sequenceNumber: 1,
      city: "MEMPHIS",
      state: "TN",
      postalCode: "38118",
    }),
    consigneeStop: stop({ sequenceNumber: 3, city: "MOBILE", state: "AL" }),
    intermediateStops: [stop({ sequenceNumber: 2 })],
    ...overrides,
  };
}

function orderDetail(overrides = {}) {
  return {
    ...order(),
    charges: {
      freight: { amount: { amount: 1250.5, currency: "USD" } },
      other: [],
      total: { amount: { amount: 1250.5, currency: "USD" } },
    },
    progressUpdates: [
      {
        event: "Telemetry",
        timestamp: "2026-11-24T10:15:00Z",
        position: {
          latitude: 32.8,
          longitude: -86.7,
          city: "TUSCALOOSA",
          state: "AL",
          postalCode: "35401",
        },
        milesToConsignee: 142.4,
      },
      {
        event: "Callin",
        timestamp: "2026-11-24T11:00:00Z",
        milesToConsignee: 98.1,
      },
    ],
    ...overrides,
  };
}

function isListUrl(url) {
  return new URL(url).pathname.endsWith("/orders");
}

function isDetailUrl(url) {
  return /\/orders\/[^/]+$/.test(new URL(url).pathname);
}

function mockFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    for (const [match, responder] of routes) {
      if (typeof match === "function" ? match(url) : url.includes(match)) {
        const out = typeof responder === "function" ? responder(url, init) : responder;
        return out;
      }
    }
    return jsonResponse(404, { error: "not found" });
  };
  return { impl, calls };
}

test("descriptor declares TMS type, API_KEY_BEARER auth, and honest capabilities", () => {
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: async () => jsonResponse(200, []) });
  assert.equal(connector.descriptor.key, MCLEOD_TNT_PROVIDER_KEY);
  assert.equal(connector.descriptor.type, "TMS");
  assert.deepEqual(connector.descriptor.auth.kinds, ["API_KEY_BEARER"]);
  assert.equal(connector.descriptor.auth.requiresCredential, true);
  assert.deepEqual(connector.descriptor.capabilities.entities.sort(), ["DELIVERY", "LOAD"]);
  assert.equal(connector.descriptor.capabilities.webhooks, false);
  assert.equal(connector.descriptor.capabilities.incrementalSync, false);
});

test("client sends required McLeod headers without exposing secrets in the URL", async () => {
  const { impl, calls } = mockFetch([[isListUrl, jsonResponse(200, [order()])]]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  await connector.verifyConnection(ctx());

  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.ok(url.startsWith(MCLEOD_TNT_SANDBOX_BASE_URL));
  assert.ok(!url.includes(SECRET_TOKEN) && !url.includes(SECRET_KEY));
  assert.equal(init.headers.Authorization, `Bearer ${SECRET_TOKEN}`);
  assert.equal(init.headers["X-Api-Key"], SECRET_KEY);
  assert.equal(init.headers["X-Mcld-Tenant"], "2");
  assert.ok(init.headers["X-Correlation-Id"]);
});

test("tenant id can be overridden via non-secret config", async () => {
  const { impl, calls } = mockFetch([[isListUrl, jsonResponse(200, [])]]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  await connector.verifyConnection(ctx({ config: { tenantId: "7" } }));
  assert.equal(calls[0].init.headers["X-Mcld-Tenant"], "7");
});

test("verifyConnection succeeds against documented array shape", async () => {
  const { impl } = mockFetch([[isListUrl, jsonResponse(200, [order()])]]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  const check = await connector.verifyConnection(ctx());
  assert.equal(check.ok, true);
  assert.match(check.detail, /1 active order/);
});

test("verifyConnection reports auth failure without leaking secrets", async () => {
  const { impl } = mockFetch([[isListUrl, jsonResponse(401, { error: "Authorization field missing" })]]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  const check = await connector.verifyConnection(ctx());
  assert.equal(check.ok, false);
  assert.ok(!check.detail.includes(SECRET_TOKEN));
  assert.ok(!check.detail.includes(SECRET_KEY));
});

test("verifyConnection rejects missing credential", async () => {
  const { impl, calls } = mockFetch([]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  void calls;
  const check = await connector.verifyConnection(ctx({ credential: null }));
  assert.equal(check.ok, false);
  assert.equal(calls.length, 0);
});

test("fetchChanges maps order to LOAD and stops to DELIVERY entities", async () => {
  const detail = orderDetail();
  const { impl, calls } = mockFetch([
    [isListUrl, jsonResponse(200, [order()])],
    [isDetailUrl, jsonResponse(200, detail)],
  ]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  const result = await connector.fetchChanges(ctx());

  const kinds = result.entities.map((e) => e.kind).sort();
  assert.deepEqual(kinds, ["DELIVERY", "DELIVERY", "LOAD"]);

  const load = result.entities.find((e) => e.kind === "LOAD");
  assert.equal(load.externalId, "100234");
  assert.equal(load.data.orderId, "100234");
  assert.equal(load.data.status, "InProgress");
  assert.equal(load.data.billToCustomerCode, "CUST01");
  assert.equal(load.data.detailAvailable, true);
  assert.equal(load.data.pickup.city, "MEMPHIS");
  assert.equal(load.data.charges.total.amount.amount, 1250.5);
  assert.equal(load.data.progressUpdates.length, 2);
  assert.equal(load.data.progressUpdates[0].position.city, "TUSCALOOSA");
  assert.equal(load.data.progressUpdates[1].position, null);

  const deliveries = result.entities.filter((e) => e.kind === "DELIVERY");
  const roles = deliveries.map((d) => d.data.stopRole).sort();
  assert.deepEqual(roles, ["consignee", "intermediate"]);
  assert.ok(deliveries.every((d) => d.data.orderId === "100234"));
  assert.ok(deliveries.every((d) => d.data.provider === "mcleod"));
  const consignee = deliveries.find((d) => d.data.stopRole === "consignee");
  assert.equal(consignee.externalId, "100234:stop:3");
  assert.equal(consignee.data.location, "MOBILE, AL 35203".replace("35203", consignee.data.postalCode));
  assert.equal(consignee.data.eta, "2026-11-25T14:00Z");
  assert.equal(consignee.data.actualArrival, null);

  // list + detail calls happened; detail URL encoded
  assert.ok(calls.some((c) => c.url.includes("/orders/100234")));
});

test("fetchChanges paginates via X-Mcld-Next-Item / startItem", async () => {
  const page1 = [order({ orderId: "A1" })];
  const page2 = [order({ orderId: "B2" })];
  const { impl, calls } = mockFetch([
    [
      (url) => url.includes("startItem=50"),
      jsonResponse(200, page2),
    ],
    [
      isListUrl,
      jsonResponse(200, page1, { "X-Mcld-Next-Item": "50" }),
    ],
    [(url) => url.endsWith("/orders/A1"), jsonResponse(200, orderDetail({ orderId: "A1" }))],
    [(url) => url.endsWith("/orders/B2"), jsonResponse(200, orderDetail({ orderId: "B2" }))],
  ]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  const result = await connector.fetchChanges(ctx());

  const loadIds = result.entities.filter((e) => e.kind === "LOAD").map((e) => e.externalId).sort();
  assert.deepEqual(loadIds, ["A1", "B2"]);
  assert.ok(calls.some((c) => c.url.includes("startItem=50")));
  assert.equal(result.nextCursor, null);
});

test("pagination stops when next-item header is absent", async () => {
  const { impl, calls } = mockFetch([
    [isListUrl, jsonResponse(200, [order()])],
    [isDetailUrl, jsonResponse(200, orderDetail())],
  ]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  await connector.fetchChanges(ctx());
  const listCalls = calls.filter((c) => isListUrl(c.url));
  assert.equal(listCalls.length, 1);
});

test("fetchChanges throws INVALID_PAYLOAD when orders list is not a recognized shape", async () => {
  const { impl } = mockFetch([[isListUrl, jsonResponse(200, { unexpected: true })]]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  await assert.rejects(
    () => connector.fetchChanges(ctx()),
    (error) => error instanceof IntegrationError && error.code === "INVALID_PAYLOAD",
  );
});

test("fetchChanges classifies 401 as AUTHENTICATION_FAILED without secrets", async () => {
  const { impl } = mockFetch([[isListUrl, jsonResponse(401, { error: "no" })]]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  await assert.rejects(
    () => connector.fetchChanges(ctx()),
    (error) => {
      assert.ok(error instanceof IntegrationError);
      assert.equal(error.code, "AUTHENTICATION_FAILED");
      assert.ok(!error.message.includes(SECRET_TOKEN));
      assert.ok(!error.message.includes(SECRET_KEY));
      return true;
    },
  );
});

test("fetchChanges classifies 429 as retryable RATE_LIMITED", async () => {
  const { impl } = mockFetch([[isListUrl, jsonResponse(429, {})]]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  await assert.rejects(
    () => connector.fetchChanges(ctx()),
    (error) => error instanceof IntegrationError && error.code === "RATE_LIMITED" && error.retryable,
  );
});

test("order detail 404 falls back to list data honestly", async () => {
  const { impl } = mockFetch([
    [isListUrl, jsonResponse(200, [order()])],
    [isDetailUrl, jsonResponse(404, { error: "not found" })],
  ]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  const result = await connector.fetchChanges(ctx());
  const load = result.entities.find((e) => e.kind === "LOAD");
  assert.equal(load.data.detailAvailable, false);
  assert.equal(load.data.charges, null);
  assert.equal(load.data.progressUpdates, null);
  assert.equal(load.data.status, "InProgress");
});

test("missing optional fields produce honest nulls, not fabricated values", async () => {
  const sparse = {
    orderId: "S1",
    status: "Available",
    shipperStop: { sequenceNumber: 1 },
    // no consigneeStop, no intermediateStops, no references
  };
  const detail = { ...sparse, charges: null, progressUpdates: [] };
  const { impl } = mockFetch([
    [isListUrl, jsonResponse(200, [sparse])],
    [isDetailUrl, jsonResponse(200, detail)],
  ]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  const result = await connector.fetchChanges(ctx());

  const load = result.entities.find((e) => e.kind === "LOAD");
  assert.equal(load.data.billToCustomerCode, null);
  assert.equal(load.data.consigneeReferenceNumber, null);
  assert.ok(load.data.missingFields.includes("consigneeStop"));
  assert.ok(load.data.missingFields.includes("intermediateStops"));
  assert.equal(load.data.pickup.city, null);
  assert.equal(load.data.pickup.location, null);
  // no DELIVERY entities without stops
  assert.equal(result.entities.filter((e) => e.kind === "DELIVERY").length, 0);
  // nothing truck/driver/assignment related was invented
  assert.ok(!("truckId" in load.data) && !("driverId" in load.data));
});

test("fetchOrderDetail=false uses list payload only", async () => {
  const { impl, calls } = mockFetch([[isListUrl, jsonResponse(200, [order()])]]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  const result = await connector.fetchChanges(
    ctx({ config: { fetchOrderDetail: false } }),
  );
  assert.ok(!calls.some((c) => isDetailUrl(c.url)));
  const load = result.entities.find((e) => e.kind === "LOAD");
  assert.equal(load.data.detailAvailable, false);
});

test("status filter is sent only when configured with a valid value", async () => {
  const { impl, calls } = mockFetch([[isListUrl, jsonResponse(200, [])]]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  await connector.fetchChanges(ctx({ config: { orderStatus: "InProgress" } }));
  assert.ok(calls[0].url.includes("status=InProgress"));

  const { impl: impl2, calls: calls2 } = mockFetch([[isListUrl, jsonResponse(200, [])]]);
  const connector2 = createMcLeodTrackAndTraceConnector({ fetchImpl: impl2 });
  await connector2.fetchChanges(ctx({ config: { orderStatus: "Bogus" } }));
  assert.ok(!calls2[0].url.includes("status="));
});

test("repeated sync produces identical checksums (idempotent)", async () => {
  const { impl } = mockFetch([
    [isListUrl, jsonResponse(200, [order()])],
    [isDetailUrl, jsonResponse(200, orderDetail())],
  ]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  const first = await connector.fetchChanges(ctx());
  const second = await connector.fetchChanges(ctx());
  assert.equal(first.entities.length, second.entities.length);
  for (let i = 0; i < first.entities.length; i += 1) {
    assert.equal(
      stableChecksum(first.entities[i].data),
      stableChecksum(second.entities[i].data),
    );
  }
});

test("mapMcLeodOrder throws MAPPING_FAILURE without orderId", () => {
  assert.throws(
    () => mapMcLeodOrder({ status: "InProgress" }, { detailAvailable: false }),
    (error) => error instanceof IntegrationError && error.code === "MAPPING_FAILURE",
  );
});

test("API_KEY_BEARER credential parses, round-trips through vault serialization, and hints safely", () => {
  const parsed = parseIntegrationCredentialInput({
    authKind: "API_KEY_BEARER",
    apiKey: SECRET_KEY,
    accessToken: SECRET_TOKEN,
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.credential.kind, "API_KEY_BEARER");

  const serialized = serializeCredentialForStorage(parsed.credential);
  const restored = parseStoredCredential(serialized);
  assert.equal(restored.kind, "API_KEY_BEARER");
  assert.equal(restored.accessToken, SECRET_TOKEN);
  assert.equal(restored.apiKey, SECRET_KEY);

  const hint = credentialHint(parsed.credential);
  assert.ok(hint.startsWith("…"));
  assert.ok(!hint.includes(SECRET_TOKEN.slice(0, -4)));
});

test("API_KEY_BEARER rejects missing or short secrets", () => {
  for (const input of [
    { authKind: "API_KEY_BEARER", apiKey: SECRET_KEY },
    { authKind: "API_KEY_BEARER", accessToken: SECRET_TOKEN },
    { authKind: "API_KEY_BEARER", apiKey: "short", accessToken: SECRET_TOKEN },
    { authKind: "API_KEY_BEARER", apiKey: SECRET_KEY, accessToken: "tiny" },
  ]) {
    const result = parseIntegrationCredentialInput(input);
    assert.equal(result.ok, false);
  }
});

test("connector registers through the builtin registry", () => {
  resetConnectorRegistry();
  registerBuiltinConnectors();
  const found = getConnector(MCLEOD_TNT_PROVIDER_KEY);
  assert.ok(found);
  assert.equal(found.descriptor.displayName, "McLeod LoadMaster Track & Trace");
  // idempotent
  registerBuiltinConnectors();
  assert.equal(getConnector(MCLEOD_TNT_PROVIDER_KEY), found);
});

test("orders list accepts the documented {items:[...]} envelope", async () => {
  const { impl } = mockFetch([
    [isListUrl, jsonResponse(200, { items: [order()] })],
    [isDetailUrl, jsonResponse(200, orderDetail())],
  ]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  const result = await connector.fetchChanges(ctx());
  assert.equal(result.entities.filter((e) => e.kind === "LOAD").length, 1);
});

test("empty orders list is a valid sync result", async () => {
  const { impl } = mockFetch([[isListUrl, jsonResponse(200, [])]]);
  const connector = createMcLeodTrackAndTraceConnector({ fetchImpl: impl });
  const result = await connector.fetchChanges(ctx());
  assert.deepEqual(result.entities, []);
  assert.equal(result.nextCursor, null);
});

test("tenant isolation: provider key and entity ids stay org-scoped via framework", () => {
  // ExternalRecord uniqueness is (organizationId, providerKey, entityKind, externalId);
  // connector only emits provider/externalId — org scoping is enforced by the
  // Phase 1A persistence layer, verified in integration-framework.test.mjs.
  resetConnectorRegistry();
  registerConnector(createMcLeodTrackAndTraceConnector({ fetchImpl: async () => jsonResponse(200, []) }));
  assert.ok(getConnector(MCLEOD_TNT_PROVIDER_KEY));
});
