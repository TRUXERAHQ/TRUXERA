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

export function getProviderSyncIntervalMinutes(
  providerKey: string,
): number | null {
  return mappers.get(providerKey)?.expectedSyncIntervalMinutes ?? null;
}

export function resetOperationalMapperRegistry(): void {
  mappers.clear();
}
