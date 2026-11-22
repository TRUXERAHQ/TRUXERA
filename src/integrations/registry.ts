import type { IntegrationConnector } from "./connector.ts";
import { IntegrationError } from "./errors.ts";

const connectors = new Map<string, IntegrationConnector>();

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

export function registerConnector(connector: IntegrationConnector): void {
  const key = connector.descriptor?.key;
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
    throw new IntegrationError(
      "CONNECTOR_UNAVAILABLE",
      "Connector key must be lowercase alphanumeric with dashes.",
    );
  }
  if (connectors.has(key)) {
    throw new IntegrationError(
      "CONNECTOR_UNAVAILABLE",
      `A connector named "${key}" is already registered.`,
    );
  }
  connectors.set(key, connector);
}

export function getConnector(providerKey: string): IntegrationConnector | null {
  return connectors.get(providerKey) ?? null;
}

export function listConnectors(): readonly IntegrationConnector[] {
  return [...connectors.values()];
}

export function resetConnectorRegistry(): void {
  connectors.clear();
}
