import type { ExternalEntityKind } from "./types.ts";
import { isExternalEntityKind } from "./types.ts";
import { IntegrationError } from "./errors.ts";
import { requireExternalId } from "./normalize.ts";

export type ExternalRef = {
  providerKey: string;
  entityKind: ExternalEntityKind;
  externalId: string;
};

const KEY_SEPARATOR = "::";

export function buildExternalKey(ref: ExternalRef): string {
  return [
    ref.providerKey,
    ref.entityKind,
    requireExternalId(ref.externalId, ref.entityKind),
  ].join(KEY_SEPARATOR);
}

export function parseExternalKey(key: string): ExternalRef {
  const parts = key.split(KEY_SEPARATOR);
  if (parts.length !== 3) {
    throw new IntegrationError(
      "INVALID_PAYLOAD",
      "External record key is malformed.",
    );
  }
  const [providerKey, entityKind, externalId] = parts;
  if (!providerKey || providerKey.length > 128) {
    throw new IntegrationError(
      "INVALID_PAYLOAD",
      "External record key has an invalid provider.",
    );
  }
  if (!isExternalEntityKind(entityKind)) {
    throw new IntegrationError(
      "INVALID_PAYLOAD",
      "External record key has an unsupported entity kind.",
    );
  }
  return {
    providerKey,
    entityKind,
    externalId: requireExternalId(externalId, entityKind),
  };
}
