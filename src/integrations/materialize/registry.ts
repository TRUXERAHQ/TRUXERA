import { IntegrationError } from "../errors.ts";
import type { OperationalEntityMapper } from "./types.ts";

const mappers = new Map<
  string,
  { mapper: OperationalEntityMapper; expectedSyncIntervalMinutes: number | null }
>();

export function registerOperationalMapper(
  providerKey: string,
  mapper: OperationalEntityMapper,
  options?: { expectedSyncIntervalMinutes?: number },
): void {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(providerKey)) {
    throw new IntegrationError(
      "CONNECTOR_UNAVAILABLE",
      "Operational mapper provider key is invalid.",
    );
  }
  const interval = options?.expectedSyncIntervalMinutes;
  mappers.set(providerKey, {
    mapper,
    expectedSyncIntervalMinutes:
      typeof interval === "number" && interval > 0 ? interval : null,
  });
}

export function getOperationalMapper(
  providerKey: string,
): OperationalEntityMapper | null {
  return mappers.get(providerKey)?.mapper ?? null;
}

const providerIntervals = new Map<string, number>();

/**
 * Register an expected sync interval for a provider that has no operational
 * mapper (e.g. signal-only connectors). Used by freshness classification.
 */
export function registerProviderSyncInterval(
  providerKey: string,
  intervalMinutes: number,
): void {
  if (intervalMinutes > 0) {
    providerIntervals.set(providerKey, intervalMinutes);
  }
}

export function getProviderSyncIntervalMinutes(
  providerKey: string,
): number | null {
  return (
    mappers.get(providerKey)?.expectedSyncIntervalMinutes ??
    providerIntervals.get(providerKey) ??
    null
  );
}

export function resetOperationalMapperRegistry(): void {
  mappers.clear();
}
