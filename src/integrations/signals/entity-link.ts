import type { ExternalEntityKind } from "../types.ts";

export type FleetEntityMatch =
  | { kind: "TRUCK"; unitNumber?: string | null; vin?: string | null }
  | { kind: "DRIVER"; licenseNumber?: string | null };

/**
 * Vendor-neutral fleet-entity match extractor. Registered per provider by
 * future connectors; deterministic identity keys only — no fuzzy matching.
 * TRUXERA-owned attributes (status, capacity, name) are never touched.
 */
export type FleetEntityExtractor = (input: {
  entityKind: ExternalEntityKind;
  payload: Record<string, unknown>;
}) => FleetEntityMatch | null;

const extractors = new Map<string, FleetEntityExtractor>();

export function registerFleetEntityExtractor(
  providerKey: string,
  extractor: FleetEntityExtractor,
): void {
  extractors.set(providerKey, extractor);
}

export function getFleetEntityExtractor(
  providerKey: string,
): FleetEntityExtractor | null {
  return extractors.get(providerKey) ?? null;
}

export function resetFleetEntityExtractors(): void {
  extractors.clear();
}

export function normalizeMatchKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
