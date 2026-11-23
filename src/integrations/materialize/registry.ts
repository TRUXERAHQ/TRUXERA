import { IntegrationError } from "../errors.ts";
import type { OperationalEntityMapper } from "./types.ts";

const mappers = new Map<string, OperationalEntityMapper>();

export function registerOperationalMapper(
  providerKey: string,
  mapper: OperationalEntityMapper,
): void {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(providerKey)) {
    throw new IntegrationError(
      "CONNECTOR_UNAVAILABLE",
      "Operational mapper provider key is invalid.",
    );
  }
  mappers.set(providerKey, mapper);
}

export function getOperationalMapper(
  providerKey: string,
): OperationalEntityMapper | null {
  return mappers.get(providerKey) ?? null;
}

export function resetOperationalMapperRegistry(): void {
  mappers.clear();
}
