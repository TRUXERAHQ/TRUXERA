import assert from "node:assert/strict";
import test from "node:test";
import {
  createSamsaraConnector,
  assertSamsaraOk,
  SAMSARA_PROVIDER_KEY,
} from "../src/integrations/connectors/samsara.ts";
import {
  extractSamsaraHosSignals,
  extractSamsaraStatsSignals,
  mapSamsaraDriver,
  mapSamsaraVehicle,
  parseSamsaraPage,
  samsaraFleetEntityExtractor,
} from "../src/integrations/connectors/samsara-normalize.ts";
import { registerFleetEntityExtractor, resetFleetEntityExtractors } from "../src/integrations/signals/entity-link.ts";
import { IntegrationError } from "../src/integrations/errors.ts";

const TOKEN = "test-token-not-real";

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => headers[n.toLowerCase()] ?? null },
    json: async () => body,
  };
}

function page(entries, endCursor = null, hasNextPage = false) {
  return { data: entries, pagination: { endCursor, hasNextPage } };
}

const vehicle = {
  id: "veh-1",
  name: "T-100",
  vin: "1HGBH41JXMN109186",
  externalIds: { "samsara.vin": "1HGBH41JXMN109186", "samsara.serial": "SN-1" },
  licensePlate: "ABC123",
};

const driver = {
  id: "drv-1",
  name: "Jane Driver",
  phone: "+15551234567",
  licenseNumber: "D123456",
  status: "active",
};

// Real feed shape: per-vehicle entry with arrays of timestamped stat events.
const feedVehicle = {
  id: "veh-1",
  name: "T-100",
  gps: [
    {
      time: "2026-03-01T11:59:00Z",
      latitude: 42.5,
      longitude: -71.2,
      speedMilesPerHour: 55,
      headingDegrees: 90,
      isEcuSpeed: false,
      reverseGeo: { formattedLocation: "16 N Fair Oaks Ave, Pasadena, CA 91103" },
    },
  ],
  engineStates: [{ time: "2026-03-01T11:58:30Z", value: "On" }],
};

const hosEntry = {
  driver: { id: "drv-1", name: "Jane Driver" },
  currentVehicle: { id: "veh-1", name: "T-100" },
  currentDutyStatus: { hosStatusType: "driving" },
  clocks: {
    drive: { driveRemainingDurationMs: 36000000 },
    shift: { shiftRemainingDurationMs: 50400000 },
    cycle: { cycleRemainingDurationMs: 252000000 },
    break: { timeUntilBreakDurationMs: 28800000 },
  },
};

function connectorWith(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  const connector = createSamsaraConnector({ fetchImpl });
  return { connector, calls };
}

function syncCtx(cursor = null, credential = { kind: "API_KEY_BEARER", apiKey: "label", accessToken: TOKEN }) {
  return {
    organizationId: "org-1",
    integrationId: "int-1",
    providerKey: SAMSARA_PROVIDER_KEY,
    config: {},
    credential,
    trigger: "MANUAL",
    cursor,
  };
}

function baseHandler(overrides = {}) {
  return async (url) => {
    if (url.includes("/fleet/vehicles?")) return jsonResponse(200, page([vehicle]));
    if (url.includes("/fleet/drivers?")) return jsonResponse(200, page([driver]));
    if (url.includes("/fleet/vehicles/stats/feed")) {
      return jsonResponse(200, overrides.stats ?? page([]));
    }
    if (url.includes("/fleet/hos/clocks")) {
      return jsonResponse(200, overrides.hos ?? page([]));
    }
    return jsonResponse(404, {});
  };
}

test("descriptor: GPS_TELEMATICS, API_KEY_BEARER, polling entities", () => {
  const { connector } = connectorWith(baseHandler());
  assert.equal(connector.descriptor.key, "samsara");
  assert.equal(connector.descriptor.type, "GPS_TELEMATICS");
  assert.deepEqual(connector.descriptor.auth.kinds, ["API_KEY_BEARER"]);
  assert.deepEqual([...connector.descriptor.capabilities.entities], ["TRUCK", "DRIVER"]);
  assert.equal(connector.descriptor.capabilities.webhooks, false);
});

test("client sends bearer auth and never leaks token in errors", async () => {
  const { connector, calls } = connectorWith(async (url) => {
    if (url.includes("vehicles")) return jsonResponse(200, page([]));
    return jsonResponse(500, {});
  });
  await connector.fetchChanges(syncCtx()).catch(() => {});
  const auth = calls[0].init.headers["Authorization"];
  assert.equal(auth, `Bearer ${TOKEN}`);
});

test("fetchChanges: entities + location/motion/hos signals + stats-only cursor", async () => {
  const statsPage = page([feedVehicle], "cursor-2", false);
  const { connector, calls } = connectorWith(
    baseHandler({ stats: statsPage, hos: page([hosEntry], "h1", false) }),
  );
  const result = await connector.fetchChanges(syncCtx());

  assert.equal(result.entities.length, 2);
  assert.equal(result.entities[0].kind, "TRUCK");
  assert.equal(result.entities[0].externalId, "veh-1");
  assert.equal(result.entities[1].kind, "DRIVER");

  const kinds = result.signals.map((s) => s.signalKind).sort();
  assert.deepEqual(kinds, ["DRIVER_DUTY_STATUS", "VEHICLE_LOCATION", "VEHICLE_MOTION_STATE"]);

  const loc = result.signals.find((s) => s.signalKind === "VEHICLE_LOCATION");
  assert.equal(loc.subjectExternalId, "veh-1");
  assert.equal(loc.subjectKind, "TRUCK");
  assert.equal(loc.value.latitude, 42.5);
  assert.equal(loc.value.headingDegrees, 90);
  assert.equal(loc.value.speedMilesPerHour, 55);
  assert.equal(loc.value.address, "16 N Fair Oaks Ave, Pasadena, CA 91103");
  assert.equal(loc.sourceTimestamp, "2026-03-01T11:59:00Z");
  assert.equal(loc.provenance, "SOURCE_FACT");
  assert.ok(loc.eventId.includes("veh-1"));

  const motion = result.signals.find((s) => s.signalKind === "VEHICLE_MOTION_STATE");
  assert.deepEqual(motion.value, { engineState: "On" });
  assert.equal(motion.sourceTimestamp, "2026-03-01T11:58:30Z");

  const hos = result.signals.find((s) => s.signalKind === "DRIVER_DUTY_STATUS");
  assert.equal(hos.subjectKind, "DRIVER");
  assert.equal(hos.subjectExternalId, "drv-1");
  assert.equal(hos.value.status, "driving");
  assert.equal(hos.value.driveRemainingDurationMs, 36000000);

  // Cursor stores only the stats feed watermark; HOS is a snapshot.
  const cursor = JSON.parse(result.nextCursor);
  assert.equal(cursor.stats, "cursor-2");
  assert.equal(cursor.hos, undefined);

  // second sync passes stored cursor as `after` on the stats feed only
  const { connector: c2, calls: calls2 } = connectorWith(baseHandler());
  await c2.fetchChanges(syncCtx(result.nextCursor));
  const feedCall = calls2.find((c) => c.url.includes("stats/feed"));
  assert.ok(feedCall.url.includes("after=cursor-2"));
  const hosCall = calls2.find((c) => c.url.includes("hos/clocks"));
  assert.ok(!hosCall.url.includes("after="));
});

test("stats feed pagination drains all pages and keeps last cursor", async () => {
  let feedCalls = 0;
  const handler = async (url) => {
    if (url.includes("/fleet/vehicles?")) return jsonResponse(200, page([]));
    if (url.includes("/fleet/drivers?")) return jsonResponse(200, page([]));
    if (url.includes("stats/feed")) {
      feedCalls += 1;
      if (feedCalls === 1) {
        return jsonResponse(200, page(
          [{ id: "v", gps: [{ time: "2026-03-01T10:00:00Z", latitude: 1, longitude: 2 }] }],
          "c1", true,
        ));
      }
      return jsonResponse(200, page(
        [{ id: "v", gps: [{ time: "2026-03-01T10:01:00Z", latitude: 3, longitude: 4 }] }],
        "c2", false,
      ));
    }
    if (url.includes("hos/clocks")) return jsonResponse(200, page([], "h1", false));
    return jsonResponse(404, {});
  };
  const { connector, calls } = connectorWith(handler);
  const result = await connector.fetchChanges(syncCtx());
  assert.equal(feedCalls, 2);
  assert.equal(result.signals.filter((s) => s.signalKind === "VEHICLE_LOCATION").length, 2);
  assert.equal(JSON.parse(result.nextCursor).stats, "c2");
  const feedCallsMade = calls.filter((c) => c.url.includes("stats/feed"));
  assert.ok(feedCallsMade[1].url.includes("after=c1"));
});

test("empty feed returns empty signals and preserves cursor", async () => {
  const { connector } = connectorWith(baseHandler());
  const result = await connector.fetchChanges(syncCtx('{"stats":"keep-me","hos":"h-keep"}'));
  assert.equal(result.signals.length, 0);
  const cursor = JSON.parse(result.nextCursor);
  assert.equal(cursor.stats, "keep-me");
});

test("legacy cursor containing hos key still parses stats cursor", async () => {
  const { connector, calls } = connectorWith(baseHandler({ stats: page([], "new-c", false) }));
  const result = await connector.fetchChanges(syncCtx('{"stats":"old-c","hos":"h-9"}'));
  const feedCall = calls.find((c) => c.url.includes("stats/feed"));
  assert.ok(feedCall.url.includes("after=old-c"));
  assert.equal(JSON.parse(result.nextCursor).stats, "new-c");
});

test("invalid stored cursor resets safely instead of throwing", async () => {
  const { connector } = connectorWith(baseHandler());
  const result = await connector.fetchChanges(syncCtx("not-json{{{"));
  assert.ok(result.entities.length === 2);
});

test("malformed vehicle/driver records are skipped, not fatal", async () => {
  const handler = async (url) => {
    if (url.includes("/fleet/vehicles?")) return jsonResponse(200, page([{ name: "no id" }, vehicle]));
    if (url.includes("/fleet/drivers?")) return jsonResponse(200, page([driver]));
    if (url.includes("stats/feed")) return jsonResponse(200, page([]));
    if (url.includes("hos/clocks")) return jsonResponse(200, page([]));
    return jsonResponse(404, {});
  };
  const { connector } = connectorWith(handler);
  const result = await connector.fetchChanges(syncCtx());
  assert.equal(result.entities.length, 2);
});

test("error mapping: 401/403/429/5xx become safe IntegrationErrors", () => {
  assert.throws(() => assertSamsaraOk(401, "x"), (e) => e.code === "AUTHENTICATION_FAILED");
  assert.throws(() => assertSamsaraOk(403, "x"), (e) => e.code === "AUTHORIZATION_FAILED");
  assert.throws(() => assertSamsaraOk(429, "x", 30), (e) => e.code === "RATE_LIMITED" && e.message.includes("30s"));
  assert.throws(() => assertSamsaraOk(503, "x"), (e) => e.code === "PROVIDER_UNAVAILABLE");
  assert.throws(() => assertSamsaraOk(400, "x"), (e) => e.code === "PROVIDER_ERROR");
});

test("fetchChanges propagates auth failure without leaking token", async () => {
  const { connector } = connectorWith(async () => jsonResponse(401, {}));
  await assert.rejects(
    connector.fetchChanges(syncCtx()),
    (e) => e instanceof IntegrationError && e.code === "AUTHENTICATION_FAILED" && !e.message.includes(TOKEN),
  );
});

test("missing credential rejected safely", async () => {
  const { connector } = connectorWith(baseHandler());
  await assert.rejects(
    connector.fetchChanges(syncCtx(null, null)),
    (e) => e.code === "CREDENTIAL_UNAVAILABLE",
  );
});

test("normalizer: vehicle maps only present fields", () => {
  const e = mapSamsaraVehicle(vehicle);
  assert.equal(e.kind, "TRUCK");
  assert.equal(e.externalId, "veh-1");
  assert.equal(e.data.name, "T-100");
  assert.equal(e.data.vin, "1HGBH41JXMN109186");
  assert.equal(e.data.licensePlate, "ABC123");
  const sparse = mapSamsaraVehicle({ id: "v2" });
  assert.deepEqual(Object.keys(sparse.data).sort(), []);
  assert.throws(() => mapSamsaraVehicle({ name: "no id" }), (e) => e.code === "MAPPING_FAILURE");
});

test("normalizer: driver maps licenseNumber when present", () => {
  const e = mapSamsaraDriver(driver);
  assert.equal(e.kind, "DRIVER");
  assert.equal(e.data.licenseNumber, "D123456");
});

test("stats signals: real feed shape, missing/invalid fields skipped", () => {
  const signals = extractSamsaraStatsSignals([
    {
      id: "v1",
      gps: [
        { time: "2026-03-01T10:00:00Z", latitude: 10, longitude: 20, speedMilesPerHour: 30 },
        { time: "2026-03-01T10:00:30Z", latitude: 999, longitude: 2 }, // invalid coords
        { latitude: 1, longitude: 2 }, // no time
      ],
      engineStates: [{ time: "2026-03-01T10:00:10Z", value: "Off" }],
    },
    { id: "v2" }, // no stats
    { name: "no id", gps: [{ time: "t", latitude: 1, longitude: 2 }] }, // no vehicle id
  ]);
  assert.equal(signals.filter((s) => s.signalKind === "VEHICLE_LOCATION").length, 1);
  assert.equal(signals.filter((s) => s.signalKind === "VEHICLE_MOTION_STATE").length, 1);
  const loc = signals.find((s) => s.signalKind === "VEHICLE_LOCATION");
  assert.equal(loc.value.address, undefined);
  assert.equal(loc.value.headingDegrees, undefined);
  const motion = signals.find((s) => s.signalKind === "VEHICLE_MOTION_STATE");
  assert.deepEqual(motion.value, { engineState: "Off" });
});

test("hos signals: duty status with present clock fields only", () => {
  const observed = "2026-03-01T12:00:00Z";
  const signals = extractSamsaraHosSignals(
    [
      {
        driver: { id: "d1" },
        currentDutyStatus: { hosStatusType: "onDuty" },
        clocks: {
          drive: { driveRemainingDurationMs: 1000 },
          shift: { shiftRemainingDurationMs: 2000 },
        },
      },
      { driver: { id: "d2" } }, // no status → skipped
      { currentDutyStatus: { hosStatusType: "driving" } }, // no driver → skipped
    ],
    observed,
  );
  assert.equal(signals.length, 1);
  assert.equal(signals[0].subjectKind, "DRIVER");
  assert.equal(signals[0].signalKind, "DRIVER_DUTY_STATUS");
  assert.equal(signals[0].value.status, "onDuty");
  assert.equal(signals[0].value.driveRemainingDurationMs, 1000);
  assert.equal(signals[0].value.cycleRemainingDurationMs, undefined);
  assert.equal(signals[0].sourceTimestamp, observed);
});

test("parseSamsaraPage rejects non-list shapes", () => {
  assert.throws(() => parseSamsaraPage({}, "x"), (e) => e.code === "INVALID_PAYLOAD");
  const p = parseSamsaraPage(page([1], "c", true), "x");
  assert.equal(p.hasNextPage, true);
  assert.equal(p.endCursor, "c");
});

test("fleet extractor: deterministic truck/driver matching keys", () => {
  resetFleetEntityExtractors();
  registerFleetEntityExtractor(SAMSARA_PROVIDER_KEY, samsaraFleetEntityExtractor);
  const truckMatch = samsaraFleetEntityExtractor({
    entityKind: "TRUCK",
    payload: { name: "T-100", vin: "VIN123" },
  });
  assert.equal(truckMatch.unitNumber, "T-100");
  assert.equal(truckMatch.vin, "VIN123");
  const driverMatch = samsaraFleetEntityExtractor({
    entityKind: "DRIVER",
    payload: { licenseNumber: "D123" },
  });
  assert.equal(driverMatch.licenseNumber, "D123");
  assert.equal(
    samsaraFleetEntityExtractor({ entityKind: "LOAD", payload: {} }),
    null,
  );
  resetFleetEntityExtractors();
});

test("verifyConnection reports safe detail", async () => {
  const { connector } = connectorWith(async () => jsonResponse(200, page([])));
  const ctx = {
    organizationId: "o", integrationId: "i", providerKey: "samsara",
    config: {}, credential: { kind: "API_KEY_BEARER", apiKey: "k", accessToken: TOKEN },
  };
  const check = await connector.verifyConnection(ctx);
  assert.equal(check.ok, true);
  const { connector: bad } = connectorWith(async () => jsonResponse(403, {}));
  const badCheck = await bad.verifyConnection(ctx);
  assert.equal(badCheck.ok, false);
  assert.ok(!badCheck.detail.includes(TOKEN));
});
