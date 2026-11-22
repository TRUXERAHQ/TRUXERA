import type {
  ExternalEntityKind,
  IntegrationType,
} from "./types.ts";
import { isExternalEntityKind } from "./types.ts";
import { IntegrationError } from "./errors.ts";

export type NormalizedEntity = {
  kind: ExternalEntityKind;
  externalId: string;
  data: Record<string, unknown>;
  externalUpdatedAt?: string | null;
};

export type EntityMapper<Input = unknown> = {
  map(raw: Input): NormalizedEntity;
};

export type NormalizationIssue = {
  index: number;
  externalId: string | null;
  code: string;
  message: string;
};

export type NormalizationResult = {
  entities: NormalizedEntity[];
  issues: NormalizationIssue[];
};

export function normalizeEntityKind(value: unknown): ExternalEntityKind {
  if (isExternalEntityKind(value)) return value;
  throw new IntegrationError(
    "MAPPING_FAILURE",
    "Mapped entity kind is not a supported external entity kind.",
  );
}

export function requireExternalId(value: unknown, kind: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new IntegrationError(
      "MAPPING_FAILURE",
      `External ${kind} record is missing a stable external id.`,
    );
  }
  if (value.length > 512) {
    throw new IntegrationError(
      "MAPPING_FAILURE",
      `External ${kind} id exceeds the maximum length.`,
    );
  }
  return value.trim();
}

export function normalizeBatch(
  kind: ExternalEntityKind,
  rawRecords: readonly unknown[],
  mapper: EntityMapper,
): NormalizationResult {
  const entities: NormalizedEntity[] = [];
  const issues: NormalizationIssue[] = [];

  rawRecords.forEach((raw, index) => {
    try {
      const entity = mapper.map(raw);
      if (entity.kind !== kind) {
        throw new IntegrationError(
          "MAPPING_FAILURE",
          `Mapper produced kind "${entity.kind}" but was registered for "${kind}".`,
        );
      }
      entities.push({
        ...entity,
        externalId: requireExternalId(entity.externalId, kind),
      });
    } catch (error) {
      issues.push({
        index,
        externalId: extractExternalId(raw),
        code: error instanceof IntegrationError ? error.code : "MAPPING_FAILURE",
        message:
          error instanceof Error ? error.message.slice(0, 300) : "Mapping failed.",
      });
    }
  });

  return { entities, issues };
}

function extractExternalId(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = (raw as Record<string, unknown>)["id"];
  return typeof candidate === "string" ? candidate.slice(0, 128) : null;
}

export function stableChecksum(data: Record<string, unknown>): string {
  const canonical = JSON.stringify(sortKeys(data));
  let hash = 0;
  for (let i = 0; i < canonical.length; i++) {
    hash = (hash * 31 + canonical.charCodeAt(i)) | 0;
  }
  return `fnv1a32:${(hash >>> 0).toString(16)}`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export type { IntegrationType };
