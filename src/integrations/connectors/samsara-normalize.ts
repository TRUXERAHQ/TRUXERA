import { IntegrationError } from "../errors.ts";
import type { ConnectorSignal } from "../connector.ts";
import type { NormalizedEntity } from "../normalize.ts";
import { requireExternalId } from "../normalize.ts";
import type { FleetEntityExtractor } from "../signals/entity-link.ts";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function pickPresent<T extends Record<string, unknown>>(
  source: Record<string, unknown> | null,
  fields: Record<string, (v: unknown) => unknown>,
): T {
  const out: Record<string, unknown> = {};
  if (!source) return out as T;
  for (const [key, pick] of Object.entries(fields)) {
    const value = pick(source[key]);
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out as T;
}

export type SamsaraPage = {
  entries: unknown[];
  endCursor: string | null;
  hasNextPage: boolean;
};

/** Parse a Samsara cursor-paginated list response ({data, pagination}). */
export function parseSamsaraPage(body: unknown, what: string): SamsaraPage {
  const record = asRecord(body);
  const data = record?.["data"];
  if (!Array.isArray(data)) {
    throw new IntegrationError(
      "INVALID_PAYLOAD",
      `Samsara ${what} response is missing a data array.`,
    );
  }
  const pagination = asRecord(record?.["pagination"]);
  return {
    entries: data,
    endCursor: str(pagination?.["endCursor"]),
    hasNextPage: pagination?.["hasNextPage"] === true,
  };
}

/** Vehicle list entry → TRUCK external record. Only present fields are kept. */
export function mapSamsaraVehicle(raw: unknown): NormalizedEntity {
  const vehicle = asRecord(raw);
  const id = vehicle ? requireExternalId(vehicle["id"], "vehicle") : null;
  if (!vehicle || !id) {
    throw new IntegrationError(
      "MAPPING_FAILURE",
      "Samsara vehicle is missing a stable id.",
    );
  }
  const externalIds = asRecord(vehicle["externalIds"]);
  const vin =
    str(externalIds?.["samsara.vin"]) ??
    str(vehicle["vin"]) ??
    str(externalIds?.["vin"]);
  return {
    kind: "TRUCK",
    externalId: id,
    data: pickPresent(vehicle, {
      name: str,
      vin: () => vin,
      serial: (v) => str(externalIds?.["samsara.serial"]) ?? str(v),
      licensePlate: str,
      make: str,
      model: str,
      year: num,
      externalIds: (v) => (asRecord(v) ? v : null),
      tags: (v) => (Array.isArray(v) ? v : null),
    }),
  };
}

/** Driver list entry → DRIVER external record. Only present fields are kept. */
export function mapSamsaraDriver(raw: unknown): NormalizedEntity {
  const driver = asRecord(raw);
  const id = driver ? requireExternalId(driver["id"], "driver") : null;
  if (!driver || !id) {
    throw new IntegrationError(
      "MAPPING_FAILURE",
      "Samsara driver is missing a stable id.",
    );
  }
  return {
    kind: "DRIVER",
    externalId: id,
    data: pickPresent(driver, {
      name: str,
      username: str,
      phone: str,
      licenseNumber: str,
      licenseState: str,
      email: str,
      status: str,
      externalIds: (v) => (asRecord(v) ? v : null),
      tags: (v) => (Array.isArray(v) ? v : null),
    }),
  };
}

function validCoordinate(lat: number | null, lon: number | null) {
  return (
    lat !== null &&
    lon !== null &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Vehicle stats feed entries → operational signals.
 *
 * Samsara feed shape (verified against the published OpenAPI): each entry
 * is a per-vehicle object `{id, name, gps?: [...], engineStates?: [...]}`
 * where every stat is an array of `{time, ...}` events.
 *
 * - `gps` events → VEHICLE_LOCATION (lat/lon required; speed, heading,
 *   isEcuSpeed, address book name and reverse-geocoded address included
 *   only when actually returned).
 * - `engineStates` events → VEHICLE_MOTION_STATE (`value` is the engine
 *   state string; nothing else is fabricated).
 *
 * Entries without a usable vehicle id or timestamp are skipped.
 */
export function extractSamsaraStatsSignals(
  entries: unknown[],
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];

  for (const raw of entries) {
    const entry = asRecord(raw);
    if (!entry) continue;
    const vehicleId = str(entry["id"]);
    if (!vehicleId) continue;

    const gpsEvents = Array.isArray(entry["gps"]) ? entry["gps"] : [];
    for (const rawGps of gpsEvents) {
      const gps = asRecord(rawGps);
      const time = gps ? str(gps["time"]) : null;
      const latitude = gps ? num(gps["latitude"]) : null;
      const longitude = gps ? num(gps["longitude"]) : null;
      if (!gps || !time || !validCoordinate(latitude, longitude)) continue;

      const addressBook = asRecord(gps["address"]);
      const reverseGeo = asRecord(gps["reverseGeo"]);
      const value = pickPresent(gps, {
        latitude: num,
        longitude: num,
        speedMilesPerHour: num,
        headingDegrees: num,
        isEcuSpeed: bool,
        address: () =>
          str(reverseGeo?.["formattedLocation"]) ??
          str(addressBook?.["name"]),
      });
      signals.push({
        subjectKind: "TRUCK",
        subjectExternalId: vehicleId,
        signalKind: "VEHICLE_LOCATION",
        value,
        provenance: "SOURCE_FACT",
        sourceTimestamp: time,
        eventId: `samsara:stats:${vehicleId}:gps:${time}`,
        dedupeKey: `${vehicleId}|VEHICLE_LOCATION|${time}`,
      });
    }

    const engineEvents = Array.isArray(entry["engineStates"])
      ? entry["engineStates"]
      : [];
    for (const rawEngine of engineEvents) {
      const engine = asRecord(rawEngine);
      const time = engine ? str(engine["time"]) : null;
      const engineState = engine ? str(engine["value"]) : null;
      if (!engine || !time || !engineState) continue;

      signals.push({
        subjectKind: "TRUCK",
        subjectExternalId: vehicleId,
        signalKind: "VEHICLE_MOTION_STATE",
        value: { engineState },
        provenance: "SOURCE_FACT",
        sourceTimestamp: time,
        eventId: `samsara:stats:${vehicleId}:engineStates:${time}`,
        dedupeKey: `${vehicleId}|VEHICLE_MOTION_STATE|${time}`,
      });
    }
  }

  return signals;
}

/**
 * Deterministic Samsara fleet-entity matcher. Vehicles match TRUXERA
 * Trucks by unit number (Samsara vehicle `name`, the fleet's unit-number
 * convention) with VIN fallback; drivers match by `licenseNumber`.
 * Only explicit fields are used — no fuzzy matching.
 */
export const samsaraFleetEntityExtractor: FleetEntityExtractor = ({
  entityKind,
  payload,
}) => {
  if (entityKind === "TRUCK") {
    return {
      kind: "TRUCK",
      unitNumber: str(payload["name"]),
      vin: str(payload["vin"]),
    };
  }
  if (entityKind === "DRIVER") {
    return { kind: "DRIVER", licenseNumber: str(payload["licenseNumber"]) };
  }
  return null;
};

/**
 * HOS clocks entries → DRIVER_DUTY_STATUS signals. Samsara's clocks
 * response carries no per-status event timestamp, so `observedAt` (the
 * time the provider response was received) is used as the honest
 * observation time. Only fields present in the payload are normalized.
 */
export function extractSamsaraHosSignals(
  entries: unknown[],
  observedAt: string,
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];

  for (const raw of entries) {
    const entry = asRecord(raw);
    if (!entry) continue;
    const driver = asRecord(entry["driver"]);
    const driverId = str(driver?.["id"]);
    const status = str(asRecord(entry["currentDutyStatus"])?.["hosStatusType"]);
    if (!driverId || !status) continue;

    const clocks = asRecord(entry["clocks"]);
    const value = pickPresent(
      {
        status,
        driveRemainingDurationMs: num(asRecord(clocks?.["drive"])?.["driveRemainingDurationMs"]),
        shiftRemainingDurationMs: num(asRecord(clocks?.["shift"])?.["shiftRemainingDurationMs"]),
        cycleRemainingDurationMs: num(asRecord(clocks?.["cycle"])?.["cycleRemainingDurationMs"]),
        timeUntilBreakDurationMs: num(asRecord(clocks?.["break"])?.["timeUntilBreakDurationMs"]),
      },
      {
        status: (v) => v,
        driveRemainingDurationMs: num,
        shiftRemainingDurationMs: num,
        cycleRemainingDurationMs: num,
        timeUntilBreakDurationMs: num,
      },
    );

    signals.push({
      subjectKind: "DRIVER",
      subjectExternalId: driverId,
      signalKind: "DRIVER_DUTY_STATUS",
      value,
      provenance: "SOURCE_FACT",
      sourceTimestamp: observedAt,
      eventId: `samsara:hos:${driverId}:${observedAt}`,
      dedupeKey: `${driverId}|DRIVER_DUTY_STATUS|${observedAt}`,
    });
  }

  return signals;
}
