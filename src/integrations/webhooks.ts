import { createHash } from "node:crypto";
import { IntegrationError } from "./errors.ts";
import type { ExternalEntityKind, WebhookStatus } from "./types.ts";

export type WebhookEnvelope = {
  providerKey: string;
  eventType: string;
  externalEventId: string;
  entityKind?: ExternalEntityKind | null;
  entityExternalId?: string | null;
  occurredAt?: string | null;
  payload: unknown;
};

export type WebhookValidationResult =
  | { ok: true; envelope: WebhookEnvelope }
  | { ok: false; error: string };

export function webhookPayloadHash(payload: unknown): string {
  const serialized =
    typeof payload === "string" ? payload : JSON.stringify(payload ?? null);
  return createHash("sha256").update(serialized).digest("hex");
}

export function parseWebhookEnvelope(input: {
  providerKey: string;
  body: unknown;
}): WebhookValidationResult {
  const { providerKey, body } = input;
  if (typeof providerKey !== "string" || providerKey.length === 0) {
    return { ok: false, error: "Missing provider identity." };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Webhook payload must be a JSON object." };
  }

  const record = body as Record<string, unknown>;
  const eventId = pickString(record, ["id", "eventId", "event_id", "deliveryId"]);
  const eventType = pickString(record, ["type", "eventType", "event_type", "action"]);

  if (!eventId || eventId.length > 256) {
    return { ok: false, error: "Webhook payload is missing a stable event id." };
  }
  if (!eventType || eventType.length > 128) {
    return { ok: false, error: "Webhook payload is missing an event type." };
  }

  return {
    ok: true,
    envelope: {
      providerKey,
      eventType,
      externalEventId: eventId,
      entityKind: pickEntityKind(record),
      entityExternalId: pickString(record, [
        "entityId",
        "entity_id",
        "externalId",
        "recordId",
      ]),
      occurredAt: pickString(record, ["occurredAt", "occurred_at", "timestamp", "createdAt"]),
      payload: body,
    },
  };
}

function pickString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function pickEntityKind(
  record: Record<string, unknown>,
): ExternalEntityKind | null {
  const raw = pickString(record, ["entityKind", "entity_kind", "resourceType", "objectType"]);
  if (!raw) return null;
  const normalized = raw.toUpperCase();
  const allowed: readonly ExternalEntityKind[] = [
    "LOAD",
    "DELIVERY",
    "TRUCK",
    "DRIVER",
    "ASSIGNMENT",
    "CUSTOMER",
  ];
  return (allowed as readonly string[]).includes(normalized)
    ? (normalized as ExternalEntityKind)
    : null;
}

export function assertWebhookStatusTransition(
  from: WebhookStatus,
  to: WebhookStatus,
): void {
  const allowed: Record<WebhookStatus, readonly WebhookStatus[]> = {
    RECEIVED: ["PROCESSED", "FAILED", "IGNORED"],
    PROCESSED: [],
    FAILED: ["RECEIVED"],
    IGNORED: [],
  };
  if (!allowed[from].includes(to)) {
    throw new IntegrationError(
      "INVALID_PAYLOAD",
      `Webhook event cannot transition from ${from} to ${to}.`,
    );
  }
}
